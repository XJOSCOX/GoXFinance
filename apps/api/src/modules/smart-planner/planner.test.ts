import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
import {
  smartForecastInput,
  localBillDate,
  plannerInputSchema,
  createDebtSchema,
} from '@goxfinance/shared'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { verifySnapshot } from '../../db/sqlite-backups'
const reserve = () =>
  plannerInputSchema.parse({
    kind: 'preferences',
    name: 'Fictional living reserve',
    essentialReserveCents: 10000,
    accountIds: [],
  })
const priority = (id: string) =>
  plannerInputSchema.parse({
    kind: 'priority',
    name: 'Fictional verified priority',
    target: { kind: 'debt', id },
    priority: 'important',
    verification: { verified: false },
  })
const bank = (member: string) => ({
  name: 'Fictional checking',
  institution: 'Fictional local bank',
  type: 'checking',
  subtype: null,
  mask: '1234',
  currency: 'USD',
  memberIds: [member],
  status: 'active',
  assetId: null,
  debtId: null,
})
async function createDebt(f: Awaited<ReturnType<typeof setup>>, members: string[]) {
  return (
    await f.ok(
      'POST',
      '/debts',
      createDebtSchema.parse({
        creditorName: 'Fictional obligation',
        accountType: 'personal_loan',
        currentBalanceCents: 100000,
        minimumPaymentCents: 12000,
        nextDueDate: '2026-11-01',
        memberAssignments: members.map((memberId) => ({ memberId, responsibility: 'joint' })),
      }),
    )
  ).debt
}
async function submission(
  f: Awaited<ReturnType<typeof setup>>,
  values: unknown,
  cookie?: string,
  revision = 0,
) {
  const d = await f.ok('GET', '/planner', undefined, cookie)
  return {
    values,
    revision,
    fingerprint: d.fingerprint,
    idempotencyKey: randomUUID(),
    reason: 'Fictional manual review',
  }
}
it.each([false, true])(
  'persists planning, dated available cash, audit, immutable snapshots and backup/restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      account = (
        await f.ok('POST', '/banking/accounts', {
          values: bank(f.member),
          idempotencyKey: randomUUID(),
        })
      ).record
    const b = {
      accountId: account.id,
      availableCents: 90000,
      effectiveAt: new Date().toISOString(),
      timezone: 'America/Chicago',
      source: 'user_reported',
      pendingIncluded: 'no',
      includedPending: [],
      notes: 'Fictional balance only',
      proof: '',
      idempotencyKey: randomUUID(),
    }
    const observation = await f.ok('POST', '/planner/balances', b)
    expect((await f.ok('POST', '/planner/balances', b)).record.id).toBe(observation.record.id)
    const source = await f.ok('GET', '/planner')
    expect(source.sources.income.transactions).toEqual([])
    expect(source.sources.expenses).toEqual([])
    expect(source.sources.cashAccounts[0].balance.availableCents).toBe(90000)
    const body = await submission(f, reserve()),
      record = (await f.ok('POST', '/planner/records', body)).record
    expect((await f.ok('POST', '/planner/records', body)).record.id).toBe(record.id)
    expect(
      (
        await f.send('POST', '/planner/records', {
          ...body,
          values: { ...(body.values as object), essentialReserveCents: 0 },
        })
      ).statusCode,
    ).toBe(409)
    const data = await f.ok('GET', '/planner'),
      input = smartForecastInput(data.settings, localBillDate(), 30),
      snapshotBody = { values: input, fingerprint: data.fingerprint, idempotencyKey: randomUUID() },
      snapshot = (await f.ok('POST', '/planner/snapshots', snapshotBody)).snapshot
    expect(snapshot.report.forecast.incomplete).toBe(true)
    expect((await f.ok('POST', '/planner/snapshots', snapshotBody)).snapshot.id).toBe(snapshot.id)
    const edited = await submission(f, { ...reserve(), essentialReserveCents: 20000 }, undefined, 1)
    await f.ok('PATCH', '/planner/records/' + record.id, edited)
    expect((await f.ok('GET', '/planner')).snapshots[0].report).toEqual(snapshot.report)
    const backup = await testRequest(f.app, 'POST', '/api/backups', f.owner.cookie, {})
    expect(backup.statusCode, backup.body).toBe(201)
    expect(() =>
      verifySnapshot(
        join(dirname(f.options.databasePath), 'backups', backup.json().backup.id + '.sqlite'),
        f.options.databaseSecurity,
      ),
    ).not.toThrow()
    const next = await f.restart(),
      after = (await testRequest(next, 'GET', f.base + '/planner', f.owner.cookie)).json()
    expect(after.records.find((r: { id: string }) => r.id === record.id).revision).toBe(2)
    expect(after.snapshots[0].report).toEqual(snapshot.report)
    expect(after.sources.cashAccounts[0].balance.availableCents).toBe(90000)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(() => db.exec("UPDATE planner_audit SET action='tampered'")).toThrow('immutable')
      expect(() => db.exec('DELETE FROM planner_snapshots')).toThrow('immutable')
    } finally {
      db.close()
    }
  },
)
it.each(['admin', 'editor'])(
  'requires Owner approval for %s shared changes, prevents self approval, and preserves rejection/cancellation audits',
  async (role) => {
    const f = await setup(false),
      user = await testUser(f.app, role),
      member = f.grant(user.id, role),
      debt = await createDebt(f, [f.member, member]),
      body = await submission(f, priority(debt.id), user.cookie)
    const result = await f.ok('POST', '/planner/records', body, user.cookie)
    expect(result.request.status).toBe('pending')
    expect((await f.ok('GET', '/planner')).records).toHaveLength(0)
    const review = {
      decision: 'approved',
      reason: 'Fictional Owner review',
      idempotencyKey: randomUUID(),
    }
    expect(
      (
        await f.send(
          'POST',
          '/planner/requests/' + result.request.id + '/review',
          review,
          user.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const approved = await f.ok(
      'POST',
      '/planner/requests/' + result.request.id + '/review',
      review,
    )
    expect(approved.record.values.target.id).toBe(debt.id)
    expect(
      (await f.ok('POST', '/planner/requests/' + result.request.id + '/review', review)).record.id,
    ).toBe(approved.record.id)
    expect(
      (
        await f.send('POST', '/planner/requests/' + result.request.id + '/review', {
          ...review,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409)
    const changed = await submission(
        f,
        { ...priority(debt.id), priority: 'critical' },
        user.cookie,
        1,
      ),
      request = (
        await f.ok('PATCH', '/planner/records/' + approved.record.id, changed, user.cookie)
      ).request
    await f.ok('POST', '/planner/requests/' + request.id + '/review', {
      decision: 'rejected',
      reason: 'Terms need verification',
      idempotencyKey: randomUUID(),
    })
    expect((await f.ok('GET', '/planner')).records[0].revision).toBe(1)
    const request2 = (
      await f.ok(
        'PATCH',
        '/planner/records/' + approved.record.id,
        await submission(f, { ...priority(debt.id), priority: 'essential' }, user.cookie, 1),
        user.cookie,
      )
    ).request
    await f.ok(
      'POST',
      '/planner/requests/' + request2.id + '/review',
      { decision: 'cancelled', reason: 'Withdraw proposal', idempotencyKey: randomUUID() },
      user.cookie,
    )
    expect(
      (await f.ok('GET', '/planner')).requests.map((r: { status: string }) => r.status),
    ).toEqual(['approved', 'rejected', 'cancelled'])
    const historyPath = '/planner/records/' + approved.record.id + '/audit'
    expect(
      (await f.ok('GET', historyPath)).history.map((r: { action: string }) => r.action),
    ).toEqual([
      'request_submitted',
      'request_approved',
      'request_submitted',
      'request_rejected',
      'request_submitted',
      'request_cancelled',
    ])
    expect(
      (await f.ok('GET', historyPath, undefined, user.cookie)).history.map(
        (r: { action: string }) => r.action,
      ),
    ).toEqual(['request_submitted', 'request_submitted', 'request_submitted', 'request_cancelled'])
  },
)
it('rejects stale approval after a source changes and rolls approval back if audit persistence fails', async () => {
  const f = await setup(false),
    user = await testUser(f.app, 'editor'),
    member = f.grant(user.id, 'editor'),
    debt = await createDebt(f, [f.member, member])
  const request = (
    await f.ok(
      'POST',
      '/planner/records',
      await submission(f, priority(debt.id), user.cookie),
      user.cookie,
    )
  ).request
  await f.ok('PATCH', '/debts/' + debt.id, { notes: 'Fictional underlying account changed' })
  expect(
    (
      await f.send('POST', '/planner/requests/' + request.id + '/review', {
        decision: 'approved',
        reason: 'Stale test',
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(409)
  const request2 = (
    await f.ok(
      'POST',
      '/planner/records',
      await submission(f, { ...priority(debt.id), name: 'Fresh proposal' }, user.cookie),
      user.cookie,
    )
  ).request
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER stop_planner_audit BEFORE INSERT ON planner_audit BEGIN SELECT RAISE(ABORT,'Fictional audit failure');END;",
    )
    expect(
      (
        await f.send('POST', '/planner/requests/' + request2.id + '/review', {
          decision: 'approved',
          reason: 'Atomic test',
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(500)
    expect(db.prepare('SELECT COUNT(*) AS n FROM planner_records').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT status FROM planner_requests WHERE id=?').get(request2.id)).toEqual({
      status: 'pending',
    })
  } finally {
    db.close()
  }
})
it('enforces Owner-exclusive, Viewer, ordinary member, household and private payroll boundaries', async () => {
  const f = await setup(false),
    admin = await testUser(f.app, 'admin'),
    member = f.grant(admin.id, 'admin'),
    viewer = await testUser(f.app, 'viewer')
  f.grant(viewer.id, 'viewer')
  const outsider = await testUser(f.app, 'outside'),
    ownDebt = await createDebt(f, [f.member]),
    regular = await createDebt(f, [member])
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, priority(ownDebt.id), admin.cookie),
        admin.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, priority(regular.id), viewer.cookie),
        viewer.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect((await f.send('GET', '/planner', undefined, outsider.cookie)).statusCode).toBe(404)
  const result = await f.ok(
    'POST',
    '/planner/records',
    await submission(f, priority(regular.id), admin.cookie),
    admin.cookie,
  )
  expect(result.record).toBeDefined()
  expect(result.request).toBeUndefined()
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, reserve(), admin.cookie),
        admin.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect(
    (await f.send('POST', '/planner/records', await submission(f, priority(randomUUID()))))
      .statusCode,
  ).toBe(403)
  expect(
    (await testRequest(f.app, 'POST', f.base + '/planner/records', undefined, {})).statusCode,
  ).toBe(401)
})
it('rejects duplicate active terms, fake completions and mismatched installment totals', async () => {
  const f = await setup(false),
    debt = await createDebt(f, [f.member]),
    base = {
      kind: 'arrangement',
      name: 'Fictional split',
      target: { kind: 'debt', id: debt.id },
      arrangementType: 'split',
      provider: 'Fictional creditor',
      originalCents: 100000,
      financedCents: 100000,
      downPaymentCents: 0,
      status: 'active',
      verification: {
        verified: true,
        source: 'Synthetic agreement',
        verifiedAt: '2026-10-19T12:00:00Z',
      },
      replacesOriginal: true,
      coverageStart: '2026-10-21',
      coverageEnd: '2026-12-01',
      installments: [{ id: randomUUID(), date: '2026-11-01', principalCents: 100000 }],
    }
  await f.ok('POST', '/planner/records', await submission(f, base))
  expect((await f.send('POST', '/planner/records', await submission(f, base))).statusCode).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, { ...base, status: 'completed' }),
      )
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, { ...base, status: 'proposed', originalCents: 50000 }),
      )
    ).statusCode,
  ).toBe(400)
})
it('balance observation and its audit are atomic and reject invented verification, future dates, timezone and pending holds', async () => {
  const f = await setup(false),
    account = (
      await f.ok('POST', '/banking/accounts', {
        values: bank(f.member),
        idempotencyKey: randomUUID(),
      })
    ).record,
    b = {
      accountId: account.id,
      availableCents: 12345,
      effectiveAt: new Date().toISOString(),
      timezone: 'America/Chicago',
      source: 'user_reported',
      pendingIncluded: 'unknown',
      includedPending: [],
      notes: '',
      proof: '',
      idempotencyKey: randomUUID(),
    }
  for (const values of [
    { ...b, source: 'verified_connected' },
    { ...b, effectiveAt: '2099-01-01T00:00:00Z' },
    { ...b, timezone: 'invalid' },
    { ...b, pendingIncluded: 'yes', includedPending: [{ eventId: 'fake', amountCents: 100 }] },
  ])
    expect((await f.send('POST', '/planner/balances', values)).statusCode).toBe(400)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER stop_planner_balance_audit BEFORE INSERT ON planner_audit BEGIN SELECT RAISE(ABORT,'Fictional failure');END;",
    )
    expect((await f.send('POST', '/planner/balances', b)).statusCode).toBe(500)
    expect(db.prepare('SELECT COUNT(*) AS n FROM bank_balance_observations').get()).toEqual({
      n: 0,
    })
  } finally {
    db.close()
  }
})

it('planner and cash-flow forms share a fingerprint and allocations never create payments or expenses', async () => {
  const f = await setup(false),
    debt = await createDebt(f, [f.member]),
    data = await f.ok('GET', '/planner'),
    flow = await f.ok('GET', '/forecasts')
  expect(data.fingerprint).toBe(flow.fingerprint)
  const values = plannerInputSchema.parse({
    kind: 'allocation',
    name: 'Fictional payment reserve',
    target: { kind: 'debt', id: debt.id },
    purpose: 'obligation',
    amountCents: 10000,
    date: '2026-11-01',
    status: 'accepted',
    priority: 'important',
    explanation: 'Fictional reserve only',
  })
  await f.ok('POST', '/planner/records', await submission(f, values))
  const after = await f.ok('GET', '/planner')
  expect(after.sources.payments).toEqual([])
  expect(after.sources.expenses).toEqual([])
  expect(after.sources.income.transactions).toEqual([])
  expect(after.sources.debts[0].currentBalanceCents).toBe(100000)
})

it('protects exclusive Owner bills while joint bill edits require approval', async () => {
  const f = await setup(false),
    user = await testUser(f.app, 'admin'),
    member = f.grant(user.id, 'admin')
  const bill = (members: string[], name: string) => ({
    name,
    category: 'Utilities',
    kind: 'one_time',
    amountType: 'fixed',
    amountCents: 10000,
    estimatedAmountCents: null,
    frequency: null,
    nextDueDate: '2026-11-01',
    endDate: null,
    autoPay: false,
    status: 'active',
    notes: null,
    linkedDebtId: null,
    memberIds: members,
  })
  const exclusive = (await f.ok('POST', '/bills', bill([f.member], 'Fictional Owner bill'))).bill,
    joint = (await f.ok('POST', '/bills', bill([f.member, member], 'Fictional shared bill'))).bill
  const values = (id: string) =>
    plannerInputSchema.parse({
      kind: 'priority',
      name: 'Fictional bill priority',
      target: { kind: 'bill', id },
      priority: 'essential',
      verification: { verified: false },
    })
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await submission(f, values(exclusive.id), user.cookie),
        user.cookie,
      )
    ).statusCode,
  ).toBe(403)
  const request = (
    await f.ok(
      'POST',
      '/planner/records',
      await submission(f, values(joint.id), user.cookie),
      user.cookie,
    )
  ).request
  expect(request.status).toBe('pending')
  expect((await f.ok('GET', '/planner')).records).toEqual([])
})

it('does not expose another member’s goal amounts or progress through planner or cash-flow sources', async () => {
  const f = await setup(false),
    user = await testUser(f.app, 'editor')
  f.grant(user.id, 'editor')
  await f.ok('POST', '/goals', {
    idempotencyKey: randomUUID(),
    values: {
      name: 'Fictional private income goal',
      goalType: 'confirmed_income',
      targetCents: 50000,
      period: 'monthly',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      responsibleMemberId: f.member,
      tradingAccountId: null,
      copyGroupId: null,
      direction: 'at_least',
      status: 'active',
      notes: null,
    },
  })
  expect((await f.ok('GET', '/planner')).sources.planner.goals).toHaveLength(1)
  expect((await f.ok('GET', '/planner', undefined, user.cookie)).sources.planner.goals).toEqual([])
  expect((await f.ok('GET', '/forecasts', undefined, user.cookie)).sources.planner.goals).toEqual(
    [],
  )
})
