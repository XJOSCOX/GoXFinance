import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import PDFDocument from 'pdfkit'
import { incomeTransactionSchema, payrollComparison } from '@goxfinance/shared'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { profile, hours } from '../../../../../packages/shared/src/payroll.fixture'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { testRequest, testUser, testHome } from '../../testing/workspace'
it.each([false, true])(
  'imports without a week, preserves unknown hours and dates, prevents duplicates and persists after restart; encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted),
      body = {
        receipt: await f.receipt(),
        sourceId: f.source.id,
        idempotencyKey: randomUUID(),
        statement,
      }
    const saved = await f.ok('POST', '/income/payroll/upload/save', body)
    expect(saved.forecasts).toEqual([])
    expect(saved.regularHundredths).toBe(4000)
    expect(saved.overtimeHundredths).toBeNull()
    expect(saved.expectedPayDate).toBe('2026-10-15')
    expect(saved.statement.payDate).toBe('2026-10-16')
    expect((await f.ok('POST', '/income/payroll/upload/save', body)).id).toBe(saved.id)
    expect(
      (
        await f.send('POST', '/income/payroll/upload/save', {
          ...body,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409)
    const income = (await f.ok('GET', '/income')).transactions
    expect(income).toHaveLength(1)
    expect(income[0]).toMatchObject({
      status: 'pending',
      actualNetCents: 80000,
      depositDate: null,
      regularHours: '40.00',
      overtimeHours: null,
      expectedGrossCents: null,
    })
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(0)
    const next = await f.restart(),
      after = await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    expect(after.json().weeks[0].statement).toEqual(saved.statement)
  },
)
it('previews a local synthetic PDF, matches the configured issuer, and does not create a week or Income before review', async () => {
  const f = await uploadFixture(),
    doc = new PDFDocument({ size: 'LETTER', margin: 0 }),
    chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve) => {
    doc.on('data', (b) => chunks.push(b))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
  doc.fontSize(8)
  for (const [y, items] of [
    [30, [[30, 'HireArt Inc.']]],
    [55, [[30, 'Pay period 10/05/2026 - 10/11/2026']]],
    [70, [[30, 'Pay date 10/16/2026']]],
    [100, [[30, 'Earnings']]],
    [
      115,
      [
        [140, 'Description'],
        [348, 'Rate'],
        [425, 'Hours'],
        [488, 'Amount'],
        [544, 'Year to date'],
      ],
    ],
    [
      130,
      [
        [37, 'Regular'],
        [342, '25.00'],
        [428, '40.00'],
        [489, '1000.00'],
        [548, '9000.00'],
      ],
    ],
    [
      145,
      [
        [30, 'Gross pay'],
        [489, '1000.00'],
      ],
    ],
    [170, [[30, 'Deductions']]],
    [
      185,
      [
        [37, 'Federal income tax'],
        [489, '200.00'],
        [548, '1800.00'],
      ],
    ],
    [
      210,
      [
        [30, 'Net pay'],
        [489, '800.00'],
      ],
    ],
  ] as [number, [number, string][]][])
    for (const [x, text] of items) doc.text(text, x, y, { lineBreak: false })
  doc.end()
  const config = await testRequest(
    f.app,
    'PUT' as never,
    f.base + '/income/payroll/profile',
    f.owner.cookie,
    {
      revision: 1,
      reason: 'Synthetic issuer',
      values: { ...profile, sourceId: f.source.id, employer: 'HireArt Inc.' },
    },
  )
  expect(config.statusCode).toBe(200)
  const preview = await f.ok('POST', '/income/payroll/upload/preview', {
    mime: 'application/pdf',
    data: (await done).toString('base64'),
  })
  expect(preview.matchedSourceId).toBe(f.source.id)
  expect(preview.statement.lines[0]).toMatchObject({
    hoursHundredths: 4000,
    rateCents: 2500,
    currentCents: 100000,
    ytdCents: 900000,
  })
  expect((await f.ok('GET', '/income/payroll')).weeks).toEqual([])
  expect((await f.ok('GET', '/income')).transactions).toEqual([])
  const lateHours = await f.ok('POST', '/income/payroll/weeks', {
    values: { ...hours, sourceId: f.source.id, expectedPayDate: '2026-11-05' },
    revision: 0,
    reason: 'Synthetic hours entered after seeing the document',
    submit: true,
    idempotencyKey: randomUUID(),
  })
  expect(lateHours.forecasts[0].eligibleForAccuracy).toBe(true)
  const repeated = await f.ok('POST', '/income/payroll/upload/preview', {
    mime: 'application/pdf',
    data: (await done).toString('base64'),
  })
  const saved = await f.ok('POST', '/income/payroll/upload/save', {
    receipt: repeated.receipt,
    idempotencyKey: randomUUID(),
    sourceId: f.source.id,
    statement: preview.statement,
  })
  expect(saved.statement.netCents).toBe(80000)
  expect(saved.statementReceivedAt).toBe(preview.receivedAt)
  expect(saved.forecasts).toEqual(lateHours.forecasts)
  expect(payrollComparison(saved)).toBeNull()
}, 15000)
it('reconciles an existing forecast week and pending paycheck without rewriting the forecast or confirmed deposit', async () => {
  const f = await uploadFixture(),
    w = await f.ok('POST', '/income/payroll/weeks', {
      values: { ...hours, sourceId: f.source.id },
      revision: 0,
      reason: 'Synthetic Sunday report',
      submit: true,
      idempotencyKey: randomUUID(),
    })
  const pending = (
    await f.ok('POST', '/income/transactions', {
      idempotencyKey: randomUUID(),
      values: incomeTransactionSchema.parse({
        sourceId: f.source.id,
        payDate: statement.payDate,
        workPeriodStart: statement.periodStart,
        workPeriodEnd: statement.periodEnd,
        status: 'pending',
        regularHours: null,
        overtimeHours: null,
        hourlyRateCents: null,
        overtimeMultiplier: '1.5',
        expectedGrossCents: null,
        expectedNetCents: null,
        actualGrossCents: null,
        deductionsCents: null,
        actualNetCents: null,
        depositDate: null,
        reference: null,
        notes: null,
        receiptConfirmed: false,
        tradingPayoutWithdrawn: false,
      }),
    })
  ).transaction
  const saved = await f.ok('POST', '/income/payroll/upload/save', {
    receipt: await f.receipt(),
    idempotencyKey: randomUUID(),
    sourceId: f.source.id,
    statement,
  })
  expect(saved.id).toBe(w.id)
  expect(saved.forecasts).toEqual(w.forecasts)
  expect(saved.incomeTransactionId).toBe(pending.id)
  const t = (await f.ok('GET', '/income')).transactions[0]
  await f.ok('PATCH', '/income/transactions/' + t.id, {
    revision: t.revision,
    reason: 'Synthetic actual receipt',
    values: incomeTransactionSchema.strip().parse({
      ...t,
      status: 'confirmed',
      receiptConfirmed: true,
      depositDate: '2026-10-17',
      actualNetCents: 79000,
    }),
  })
  const corrected = await f.ok('POST', '/income/payroll/upload/save', {
    receipt: await f.receipt(),
    idempotencyKey: randomUUID(),
    sourceId: f.source.id,
    statement: {
      ...statement,
      netCents: 81000,
      deductionsCents: 19000,
      lines: statement.lines.map((l) =>
        l.side === 'deduction' ? { ...l, currentCents: 19000 } : l,
      ),
    },
  })
  expect(corrected.forecasts).toEqual(w.forecasts)
  expect((await f.ok('GET', '/income')).transactions[0]).toMatchObject({
    actualNetCents: 79000,
    depositDate: '2026-10-17',
    actualGrossCents: 100000,
  })
})
it('rejects stale or forged previews and rolls back new settings, weeks and Income on failure', async () => {
  const f = await uploadFixture(false, false),
    body = {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      profile: { ...profile, sourceId: f.source.id },
      statement,
    }
  expect(
    (await f.send('POST', '/income/payroll/upload/save', { ...body, receipt: body.receipt + 'x' }))
      .statusCode,
  ).toBe(409)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_import_audit BEFORE INSERT ON payroll_audit WHEN NEW.action='upload_import_saved' BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END;",
    )
    expect((await f.send('POST', '/income/payroll/upload/save', body)).statusCode).toBe(500)
    expect((await f.ok('GET', '/income/payroll')).weeks).toEqual([])
    expect((await f.ok('GET', '/income/payroll')).profiles).toEqual([])
    expect((await f.ok('GET', '/income')).transactions).toEqual([])
    db.exec('DROP TRIGGER reject_import_audit')
  } finally {
    db.close()
  }
  await f.ok('POST', '/income/payroll/upload/save', body)
  expect(
    (await f.send('POST', '/income/payroll/upload/save', { ...body, idempotencyKey: randomUUID() }))
      .statusCode,
  ).toBe(409)
})
it.each(['admin', 'editor', 'viewer'])(
  'enforces Owner and cross-household privacy for global upload as %s',
  async (role) => {
    const f = await uploadFixture(),
      actor = await testUser(f.app, 'Upload' + role)
    f.grant(actor.id, role)
    expect(
      (
        await f.send(
          'POST',
          '/income/payroll/upload/preview',
          { mime: 'application/pdf', data: 'invalid' },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'POST',
          '/income/payroll/upload/save',
          {
            receipt: await f.receipt(),
            idempotencyKey: randomUUID(),
            sourceId: f.source.id,
            statement,
          },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(409)
    const other = await testHome(f.app, actor.cookie)
    expect(
      (
        await testRequest(
          f.app,
          'POST',
          `/api/households/${other.home}/income/payroll/upload/save`,
          actor.cookie,
          {
            receipt: await f.receipt(),
            idempotencyKey: randomUUID(),
            sourceId: f.source.id,
            statement,
          },
        )
      ).statusCode,
    ).toBe(409)
  },
)
