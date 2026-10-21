import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser, testHome } from '../../testing/workspace'
import { signUploadReceipt } from './payroll-upload-receipt'
import { statement } from './payroll.fixture'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import PDFDocument from 'pdfkit'
import { incomeTransactionSchema } from '@goxfinance/shared'
function receipt(f: Awaited<ReturnType<typeof setup>>, actor = f.owner.id, member = f.member) {
  return signUploadReceipt({
    home: f.home,
    actor,
    createMemberId: member,
    digest: randomUUID().replaceAll('-', '').repeat(2),
    receivedAt: new Date().toISOString(),
    weeks: {},
    profiles: {},
  })
}
it.each([false, true])(
  'creates employer and reviewed paycheck atomically, confirms once and persists after restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      body = {
        receipt: receipt(f),
        idempotencyKey: randomUUID(),
        newSource: { name: 'Fictional new employer' },
        statement,
      }
    const saved = await f.ok('POST', '/income/payroll/upload/save', body)
    const data = await f.ok('GET', '/income'),
      source = data.sources[0],
      t = data.transactions[0]
    expect(source).toMatchObject({
      name: 'Fictional new employer',
      responsibleMemberId: f.member,
      hourlyRateCents: 2500,
      expectedNetCents: null,
      frequency: 'weekly',
    })
    expect(saved).toMatchObject({
      sourceId: source.id,
      expectedPayDate: statement.payDate,
      stage: 'paystub_reviewed',
    })
    expect(saved.forecasts).toEqual([])
    expect(t).toMatchObject({ status: 'pending', depositDate: null, actualNetCents: 80000 })
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(0)
    expect((await f.ok('POST', '/income/payroll/upload/save', body)).id).toBe(saved.id)
    expect(
      (
        await f.send('POST', '/income/payroll/upload/save', {
          ...body,
          receipt: receipt(f),
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409)
    const values = incomeTransactionSchema
      .strip()
      .parse({ ...t, status: 'confirmed', receiptConfirmed: true, depositDate: '2026-10-17' })
    await f.ok('PATCH', '/income/transactions/' + t.id, {
      values,
      revision: t.revision,
      reason: 'Fictional receipt confirmed',
    })
    expect(
      (
        await f.send('PATCH', '/income/transactions/' + t.id, {
          values,
          revision: t.revision,
          reason: 'Duplicate receipt',
        })
      ).statusCode,
    ).toBe(409)
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(80000)
    const next = await f.restart(),
      after = await testRequest(next, 'GET', f.base + '/income', f.owner.cookie)
    expect(after.json().sources).toHaveLength(1)
    expect(after.json().transactions).toHaveLength(1)
    expect(after.json().transactions[0]).toMatchObject({
      depositDate: '2026-10-17',
      status: 'confirmed',
    })
  },
)
it('rolls back employer, profile, statement and paycheck if final audit fails', async () => {
  const f = await setup(false),
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_import_audit BEFORE INSERT ON payroll_audit WHEN NEW.action='upload_import_saved' BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END;",
    )
    expect(
      (
        await f.send('POST', '/income/payroll/upload/save', {
          receipt: receipt(f),
          idempotencyKey: randomUUID(),
          newSource: { name: 'Rollback employer' },
          statement,
        })
      ).statusCode,
    ).toBe(500)
    expect((await f.ok('GET', '/income')).sources).toEqual([])
    expect((await f.ok('GET', '/income')).transactions).toEqual([])
    expect((await f.ok('GET', '/income/payroll')).profiles).toEqual([])
    expect((await f.ok('GET', '/income/payroll')).weeks).toEqual([])
  } finally {
    db.close()
  }
})
it.each(['admin', 'editor', 'viewer'])(
  'scopes automatic employer creation to authorized membership: %s',
  async (role) => {
    const f = await setup(false),
      actor = await testUser(f.app, 'Auto' + role),
      member = f.grant(actor.id, role)
    const body = {
      receipt: receipt(f, actor.id, member),
      idempotencyKey: randomUUID(),
      newSource: { name: 'Fictional personal employer' },
      statement,
    }
    const result = await f.send('POST', '/income/payroll/upload/save', body, actor.cookie)
    expect(result.statusCode).toBe(role === 'viewer' ? 403 : 200)
    if (role !== 'viewer')
      expect(
        (await f.ok('GET', '/income', undefined, actor.cookie)).sources[0].responsibleMemberId,
      ).toBe(member)
    const foreign = await testHome(f.app, (await testUser(f.app, 'OtherHousehold')).cookie)
    expect(
      (
        await testRequest(
          f.app,
          'POST',
          `/api/households/${foreign.home}/income/payroll/upload/save`,
          actor.cookie,
          body,
        )
      ).statusCode,
    ).toBeGreaterThanOrEqual(400)
    expect(
      (
        await f.send(
          'POST',
          '/income/payroll/upload/save',
          {
            ...body,
            receipt: receipt(f, actor.id, f.member),
            idempotencyKey: randomUUID(),
            newSource: { name: 'Owner impersonation' },
          },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  },
)

it.each([false, true])(
  'previews without sources, retains only a fingerprint receipt across restart and enforces receipt foreign keys; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      doc = new PDFDocument({ size: 'LETTER', margin: 0 }),
      chunks: Buffer[] = []
    const done = new Promise<Buffer>((resolve) => {
      doc.on('data', (b) => chunks.push(b))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })
    doc.fontSize(9)
    for (const [y, text] of [
      [30, 'Fictional New Employer'],
      [55, 'Pay period 10/05/2026 - 10/11/2026'],
      [70, 'Pay date 10/16/2026'],
      [100, 'Gross pay 1000.00'],
      [120, 'Deductions 200.00'],
      [140, 'Net pay 800.00'],
    ] as const)
      doc.text(text, 30, y, { lineBreak: false })
    doc.end()
    const body = { mime: 'application/pdf', data: (await done).toString('base64') }
    const preview = await f.ok('POST', '/income/payroll/upload/preview', body)
    expect(preview.sources).toEqual([])
    expect(preview.newSourceMember).toMatchObject({ id: f.member })
    expect((await f.ok('GET', '/income')).sources).toEqual([])
    const next = await f.restart(),
      again = await testRequest(
        next,
        'POST',
        f.base + '/income/payroll/upload/preview',
        f.owner.cookie,
        body,
      )
    expect(again.statusCode).toBe(200)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      const rows = db.prepare('SELECT * FROM payroll_upload_receipts').all() as {
        received_at: string
      }[]
      expect(rows).toHaveLength(1)
      expect(rows[0].received_at).toBe(preview.receivedAt)
      const insert = db.prepare(
        'INSERT INTO payroll_upload_receipts(id,household_id,actor_user_id,document_digest,received_at) VALUES(?,?,?,?,?)',
      )
      expect(() =>
        insert.run(
          randomUUID(),
          f.home,
          f.owner.id,
          preview.documentDigest,
          new Date().toISOString(),
        ),
      ).toThrow()
      expect(() =>
        insert.run(
          randomUUID(),
          randomUUID(),
          f.owner.id,
          'invalid-home',
          new Date().toISOString(),
        ),
      ).toThrow()
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  },
)
