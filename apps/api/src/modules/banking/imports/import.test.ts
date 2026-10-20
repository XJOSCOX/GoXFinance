import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup } from '../../../testing/financial-workspace'
import { testRequest, testUser } from '../../../testing/workspace'
import { create, edit } from '../../trading/trading.fixture'
import { openSqlite } from '../../../db/encryption/sqlite-engine'
import { statementInput } from './import.fixture'
const profile = (member: string) => ({
  name: 'Fictional import account',
  institution: 'Fictional bank',
  type: 'checking',
  subtype: null,
  mask: '1234',
  currency: 'USD',
  memberIds: [member],
  status: 'active',
  assetId: null,
  debtId: null,
})
it.each([false, true])(
  'imports atomically and idempotently without accounting entries; restart encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      a = (await f.ok('POST', '/banking/accounts', create(profile(f.member)))).record,
      input = statementInput(a.id),
      preview = await f.ok('POST', '/banking/imports/preview', input),
      body = {
        input,
        previewHash: preview.hash,
        selectedRows: [0, 1],
        confirmPossibleDuplicates: false,
        idempotencyKey: randomUUID(),
      }
    expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(0)
    expect(await f.ok('POST', '/banking/imports/confirm', body)).toMatchObject({
      imported: 2,
      replayed: false,
    })
    expect(await f.ok('POST', '/banking/imports/confirm', body)).toMatchObject({
      imported: 2,
      replayed: true,
    })
    expect((await f.ok('POST', '/banking/imports/preview', input)).duplicateCount).toBe(2)
    expect(
      (
        await f.send(
          'PATCH',
          '/banking/accounts/' + a.id,
          edit(1, { ...profile(f.member), currency: 'EUR' }),
        )
      ).statusCode,
    ).toBe(409)
    const next = await f.restart(),
      inbox = (await testRequest(next, 'GET', f.base + '/banking/inbox', f.owner.cookie)).json()
    expect(
      inbox.transactions
        .map((t: { amountCents: number }) => t.amountCents)
        .sort((x: number, y: number) => x - y),
    ).toEqual([-4218, 12550])
    expect(
      inbox.transactions.every((t: { reviewStatus: string }) => t.reviewStatus === 'unreviewed'),
    ).toBe(true)
    expect(JSON.stringify(inbox)).not.toMatch(
      /fingerprint|sourceHash|providerTransactionId|tokenCiphertext/,
    )
    const overview = (
      await testRequest(next, 'GET', f.base + '/overview?month=2026-10', f.owner.cookie)
    ).json()
    expect(overview.actual.cashOutflowCents).toBe(0)
    expect(overview.income.confirmedCents).toBe(0)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.prepare('SELECT COUNT(*) n FROM bank_reconciliations').get()).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  },
)
it('requires explicit possible duplicate confirmation, rejects stale previews and parallel duplicates', async () => {
  const f = await setup(false),
    a = (await f.ok('POST', '/banking/accounts', create(profile(f.member)))).record,
    input = statementInput(a.id),
    preview = await f.ok('POST', '/banking/imports/preview', input),
    body = {
      input,
      previewHash: preview.hash,
      selectedRows: [0],
      confirmPossibleDuplicates: false,
      idempotencyKey: randomUUID(),
    }
  const results = await Promise.all([
    f.send('POST', '/banking/imports/confirm', body),
    f.send('POST', '/banking/imports/confirm', body),
  ])
  expect(results.map((r) => r.statusCode)).toEqual([200, 200])
  expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(1)
  const different = {
      ...input,
      text: input.text.replace('Fictional groceries', 'Other description'),
    },
    p = await f.ok('POST', '/banking/imports/preview', different),
    b = { ...body, input: different, previewHash: p.hash, idempotencyKey: randomUUID() }
  expect(p.possibleDuplicateCount).toBe(1)
  expect((await f.send('POST', '/banking/imports/confirm', b)).statusCode).toBe(409)
  expect(
    await f.ok('POST', '/banking/imports/confirm', { ...b, confirmPossibleDuplicates: true }),
  ).toMatchObject({ imported: 1 })
  const stale = await f.ok('POST', '/banking/imports/preview', input)
  await f.ok(
    'PATCH',
    '/banking/accounts/' + a.id,
    edit(1, { ...profile(f.member), name: 'Renamed' }),
  )
  expect(
    (
      await f.send('POST', '/banking/imports/confirm', {
        ...body,
        previewHash: stale.hash,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(409)
})
it('retains legitimate identical rows, validates selections, and rolls back failed audits', async () => {
  const f = await setup(false),
    a = (await f.ok('POST', '/banking/accounts', create(profile(f.member)))).record,
    input = statementInput(
      a.id,
      'date,description,amount\n2026-10-01,Same purchase,-1\n2026-10-01,Same purchase,-1\n2026-10-01,Bad,1.111',
    ),
    p = await f.ok('POST', '/banking/imports/preview', input),
    body = {
      input,
      previewHash: p.hash,
      selectedRows: [0, 1],
      confirmPossibleDuplicates: false,
      idempotencyKey: randomUUID(),
    }
  expect(p.invalidCount).toBe(1)
  expect(
    (await f.send('POST', '/banking/imports/confirm', { ...body, selectedRows: [2] })).statusCode,
  ).toBe(400)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_import_audit BEFORE INSERT ON bank_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect((await f.send('POST', '/banking/imports/confirm', body)).statusCode).toBe(500)
    expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(0)
    expect(db.prepare('SELECT COUNT(*) n FROM bank_import_batches').get()).toEqual({ n: 0 })
    db.exec('DROP TRIGGER reject_import_audit')
    expect(await f.ok('POST', '/banking/imports/confirm', body)).toMatchObject({ imported: 2 })
  } finally {
    db.close()
  }
})
it('enforces household membership, account grants, Viewer read-only and hidden account protection', async () => {
  const f = await setup(false),
    a = (await f.ok('POST', '/banking/accounts', create(profile(f.member)))).record
  let rev = 1
  for (const role of ['admin', 'editor', 'viewer']) {
    const u = await testUser(f.app, role),
      member = f.grant(u.id, role),
      input = statementInput(a.id)
    expect((await f.send('POST', '/banking/imports/preview', input, u.cookie)).statusCode).toBe(404)
    await f.ok(
      'PATCH',
      '/banking/accounts/' + a.id,
      edit(rev++, { ...profile(f.member), memberIds: [f.member, member] }),
    )
    expect((await f.send('POST', '/banking/imports/preview', input, u.cookie)).statusCode).toBe(
      role === 'viewer' ? 403 : 200,
    )
    expect((await f.ok('GET', '/banking/inbox', undefined, u.cookie)).canReview).toBe(
      role !== 'viewer',
    )
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect((await f.send('GET', '/banking/inbox', undefined, outsider.cookie)).statusCode).toBe(404)
  await f.ok(
    'PATCH',
    '/banking/accounts/' + a.id,
    edit(rev, { ...profile(f.member), status: 'hidden' }),
  )
  expect((await f.send('POST', '/banking/imports/preview', statementInput(a.id))).statusCode).toBe(
    409,
  )
})
