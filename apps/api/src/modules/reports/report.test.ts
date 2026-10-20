import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import type { FinancialReport, ReportFilters } from '@goxfinance/shared'
import { setup, create, edit, accountInput, payoutInput } from '../trading/trading.fixture'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
export const filters: ReportFilters = {
  kind: 'all',
  from: '2026-10-01',
  to: '2026-10-31',
  memberId: null,
  categoryId: null,
  debtId: null,
  accountId: null,
  groupId: null,
}
const debt = (member: string, name = 'Fictional private debt') => ({
  creditorName: name,
  accountType: 'credit_card',
  currentBalanceCents: 100000,
  memberAssignments: [{ memberId: member, responsibility: 'primary' }],
})
const find = (r: FinancialReport, name: string) => r.tables.find((t) => t.name === name)!.rows
it.each([false, true])(
  'reports remain read-only, private, durable and downloadable; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted)
    await f.ok('POST', '/debts', debt(f.member))
    const report = (await f.ok('POST', '/reports/preview', filters)) as FinancialReport
    expect(report).toMatchObject({
      schemaVersion: 1,
      restorable: false,
      kind: 'financial_report_export',
      householdId: f.home,
    })
    expect(find(report, 'Debt balances as of report end')[0].balanceCents).toBe(100000)
    expect(find(report, 'Debt payoff progress')).toHaveLength(0)
    for (const format of ['json', 'csv', 'xlsx', 'pdf']) {
      const res = await f.send('POST', '/reports/export', { filters, format })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.headers['cache-control']).toContain('no-store')
      expect(res.headers['content-disposition']).toContain('attachment; filename="goxfinance-')
      if (format === 'json') expect(res.json()).toMatchObject({ restorable: false })
      if (format === 'xlsx') expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK')
      if (format === 'pdf') expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    }
    expect(JSON.stringify(report)).not.toMatch(
      /passwordHash|sessionToken|tokenHash|sourcesJson|idempotencyKey|createdByUserId/,
    )
    const next = await f.restart(),
      saved = (
        await testRequest(next, 'POST', f.base + '/reports/preview', f.owner.cookie, filters)
      ).json() as FinancialReport
    expect(find(saved, 'Debt balances as of report end')[0].balanceCents).toBe(100000)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.prepare('SELECT COUNT(*) n FROM debt_payments').get()).toMatchObject({ n: 0 })
    } finally {
      db.close()
    }
  },
  25000,
)
it('protects Owner-exclusive records for Admin, Editor and Viewer, permits associated joint records and blocks outsiders/forged filters', async () => {
  const f = await setup(false),
    privateDebt = (await f.ok('POST', '/debts', debt(f.member))).debt
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    const joint = (
      await f.ok('POST', '/debts', {
        ...debt(f.member, 'Fictional joint ' + role),
        memberAssignments: [
          { memberId: f.member, responsibility: 'joint' },
          { memberId: member, responsibility: 'joint' },
        ],
      })
    ).debt
    const own = (await f.ok('POST', '/debts', debt(member, 'Fictional own ' + role))).debt
    const report = (await f.ok(
      'POST',
      '/reports/preview',
      filters,
      actor.cookie,
    )) as FinancialReport
    const ids = find(report, 'Debt balances as of report end').map((r) => r.id)
    expect(ids).toContain(joint.id)
    expect(ids).toContain(own.id)
    expect(ids).not.toContain(privateDebt.id)
    expect(JSON.stringify(report)).not.toContain('Fictional private debt')
    expect(
      (await f.send('POST', '/reports/preview', { ...filters, memberId: f.member }, actor.cookie))
        .statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'POST',
          '/reports/preview',
          { ...filters, debtId: privateDebt.id },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await f.send('POST', '/reports/export', { filters, format: 'json' }, actor.cookie))
        .statusCode,
    ).toBe(200)
  }
  const outsider = await testUser(f.app, 'Outsider')
  expect((await f.send('GET', '/reports/options', undefined, outsider.cookie)).statusCode).toBe(404)
  for (const key of ['memberId', 'debtId', 'categoryId', 'accountId', 'groupId'])
    expect(
      (await f.send('POST', '/reports/preview', { ...filters, [key]: randomUUID() })).statusCode,
    ).toBe(403)
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: f.base + '/reports/export',
        payload: { filters, format: 'json' },
      })
    ).statusCode,
  ).toBe(403)
  expect(
    (await testRequest(f.app, 'POST', f.base + '/reports/preview', '', filters)).statusCode,
  ).toBe(401)
  expect(
    (await f.send('POST', '/reports/preview', { ...filters, to: '2026-09-01' })).statusCode,
  ).toBe(400)
  expect((await f.send('POST', '/reports/export', { filters, format: 'sql' })).statusCode).toBe(400)
}, 25000)
it('keeps linked bill/debt payments authoritative, partial bills distinct, and noncompleted activity out of cash', async () => {
  const f = await setup(false),
    d = (await f.ok('POST', '/debts', debt(f.member))).debt
  const bill = (
    await f.ok('POST', '/bills', {
      name: 'Fictional linked payment',
      category: 'Other',
      kind: 'recurring',
      amountType: 'fixed',
      amountCents: 30000,
      estimatedAmountCents: null,
      frequency: 'monthly',
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: d.id,
      memberIds: [f.member],
    })
  ).bill
  const path = `/bills/${bill.id}/periods/${bill.periods[0].id}/payments`
  await f.ok('POST', path, {
    idempotencyKey: randomUUID(),
    amountCents: 20000,
    paymentDate: '2026-10-02',
    method: 'cash',
    notes: null,
    status: 'completed',
  })
  await f.ok('POST', path, {
    idempotencyKey: randomUUID(),
    amountCents: 10000,
    paymentDate: '2026-10-03',
    method: 'cash',
    notes: null,
    status: 'pending',
  })
  await f.ok('POST', `/debts/${d.id}/payments`, {
    idempotencyKey: randomUUID(),
    amountCents: 4000,
    paymentDate: '2026-10-04',
    paymentStatus: 'scheduled',
    paymentMethod: 'cash',
  })
  const report = (await f.ok('POST', '/reports/preview', filters)) as FinancialReport
  expect(find(report, 'Cash outflow history')).toHaveLength(1)
  expect(find(report, 'Monthly income and spending')[0]).toMatchObject({
    cashOutflowCents: 20000,
    purchaseSpendingCents: 0,
    debtRepaymentCents: 20000,
  })
  expect(find(report, 'Bill obligations')[0]).toMatchObject({
    billedCents: 30000,
    paidCents: 20000,
    remainingCents: 10000,
  })
  expect(find(report, 'Debt balances as of report end')[0].balanceCents).toBe(100000)
  const past = (await f.ok('POST', '/reports/preview', {
    ...filters,
    to: '2026-10-01',
  })) as FinancialReport
  expect(find(past, 'Monthly income and spending')[0].cashOutflowCents).toBe(0)
  expect(find(past, 'Bill obligations')[0].paidCents).toBe(0)
})
it('counts copied P&L once, preserves historical membership and keeps confirmed payout income separate', async () => {
  const f = await setup(false),
    accounts = []
  for (let i = 0; i < 3; i++)
    accounts.push(
      (await f.ok('POST', '/trading/accounts', create(accountInput(f.member, 'Fictional ' + i))))
        .record,
    )
  const g = (
    await f.ok(
      'POST',
      '/trading/groups',
      create({
        name: 'Fictional group',
        leadAccountId: accounts[0].id,
        status: 'active',
        members: accounts.map((a) => ({ accountId: a.id, quantityMultiplier: '1' })),
      }),
    )
  ).record
  const input = {
    groupId: g.id,
    sessionAt: '2026-10-10T20:00:00Z',
    mode: 'daily',
    instrument: null,
    direction: null,
    notes: null,
    entries: accounts.map((a, i) => ({
      accountId: a.id,
      quantity: '1',
      grossCents: [10000, -5000, 0][i],
      profitCents: [10000, 0, 0][i],
      lossCents: [0, 5000, 0][i],
      feesCents: 100,
    })),
  }
  await f.ok('POST', '/trading/events', create(input))
  const payout = (
    await f.ok(
      'POST',
      '/trading/payouts',
      create({
        ...payoutInput(accounts[0].id),
        requestedCents: 9000,
        status: 'paid',
        receivedCents: 9000,
        depositDate: '2026-10-11',
        receiptConfirmed: true,
      }),
    )
  ).record
  const r = (await f.ok('POST', '/reports/preview', filters)) as FinancialReport
  expect(find(r, 'Trading performance').find((r) => r.stage === 'funded')).toMatchObject({
    netCents: 4700,
    feesCents: 300,
    profitCents: 10000,
    lossCents: 5000,
  })
  expect(find(r, 'Copy group performance')[0].netCents).toBe(4700)
  expect(find(r, 'Confirmed payout income')).toHaveLength(1)
  expect(find(r, 'Confirmed payout income')[0].id).toBe(payout.incomeTransactionId)
  expect(find(r, 'Monthly income and spending')[0].confirmedIncomeCents).toBe(9000)
  const one = (await f.ok('POST', '/reports/preview', {
    ...filters,
    accountId: accounts[1].id,
  })) as FinancialReport
  expect(find(one, 'Account performance')).toHaveLength(1)
  expect(find(one, 'Trading performance').find((r) => r.stage === 'funded')!.netCents).toBe(-5100)
  await f.ok(
    'PATCH',
    '/trading/groups/' + g.id,
    edit(g.revision, {
      name: 'Fictional group renamed',
      leadAccountId: accounts[0].id,
      status: 'inactive',
      members: accounts.slice(0, 2).map((a) => ({ accountId: a.id, quantityMultiplier: '1' })),
    }),
  )
  const history = (await f.ok('POST', '/reports/preview', filters)) as FinancialReport
  expect(find(history, 'Copy group performance')[0].netCents).toBe(4700)
})

it('reports split credit purchases against category budgets, without adding repayment as spending', async () => {
  const f = await setup(false),
    categories = (await f.ok('GET', '/categories')).categories
  const [a, b] = categories
  await f.ok(
    'POST',
    '/budgets',
    create({
      month: '2026-10',
      responsibleMemberId: null,
      totalCents: 100000,
      notes: null,
      status: 'active',
      limits: [
        { categoryId: a.id, amountCents: 60000 },
        { categoryId: b.id, amountCents: 30000 },
      ],
    }),
  )
  await f.ok('POST', '/expenses', {
    idempotencyKey: randomUUID(),
    expense: {
      description: 'Fictional credit purchase',
      merchant: null,
      amountCents: 34218,
      transactionDate: '2026-10-05',
      responsibleMemberId: f.member,
      paymentMethod: 'credit_card',
      linkedDebtId: null,
      notes: null,
      allocations: [
        { categoryId: a.id, amountCents: 20000 },
        { categoryId: b.id, amountCents: 14218 },
      ],
    },
  })
  const r = (await f.ok('POST', '/reports/preview', {
    ...filters,
    categoryId: a.id,
  })) as FinancialReport
  expect(find(r, 'Monthly income and spending')[0]).toMatchObject({
    purchaseSpendingCents: 20000,
    cashOutflowCents: 0,
  })
  expect(find(r, 'Category budgets versus actual')).toHaveLength(1)
  expect(find(r, 'Category budgets versus actual')[0]).toMatchObject({
    categoryLimitCents: 60000,
    actualPurchaseCents: 20000,
    remainingCents: 40000,
    monthlyAllocationCents: 100000,
  })
})
it('uses dated net worth corrections, immutable captures and goal progress through the reporting cutoff', async () => {
  const f = await setup(false),
    body = {
      name: 'Fictional vehicle',
      category: 'vehicle',
      memberIds: [f.member],
      debtIds: [],
      acquisitionDate: null,
      purchaseCents: 9999999,
      notes: null,
      status: 'active',
      valuation: {
        valueCents: 1000000,
        valuationDate: '2026-10-01',
        source: 'Fictional estimate',
        confidence: 'estimated',
        notes: null,
        supersedesId: null,
      },
    }
  const asset = (await f.ok('POST', '/assets', create(body))).record
  await f.ok('POST', '/assets/' + asset.id + '/valuations', {
    idempotencyKey: randomUUID(),
    revision: 1,
    values: { ...body.valuation, valueCents: 900000, valuationDate: '2026-10-10' },
    reason: 'Later fictional observation',
  })
  const old = (await f.ok('POST', '/reports/preview', {
    ...filters,
    to: '2026-10-05',
  })) as FinancialReport
  expect(find(old, 'Net worth subtotal')[0]).toMatchObject({
    assetsCents: 1000000,
    incomplete: true,
  })
  const current = (await f.ok('POST', '/reports/preview', filters)) as FinancialReport
  expect(find(current, 'Net worth subtotal')[0].assetsCents).toBe(900000)
  const goal = (
    await f.ok(
      'POST',
      '/goals',
      create({
        name: 'Fictional dated savings',
        goalType: 'manual',
        targetCents: 10000,
        period: 'custom',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        responsibleMemberId: f.member,
        tradingAccountId: null,
        copyGroupId: null,
        direction: 'at_least',
        status: 'active',
        notes: null,
        timezone: null,
        sessionStart: null,
      }),
    )
  ).record
  for (const date of ['2026-10-02', '2026-10-10'])
    await f.ok(
      'POST',
      '/goals/contributions',
      create({ goalId: goal.id, amountCents: 1000, date, notes: 'Fictional contribution' }),
    )
  const historical = (await f.ok('POST', '/reports/preview', {
    ...filters,
    to: '2026-10-05',
  })) as FinancialReport
  expect(find(historical, 'Financial goal progress')[0].actualCents).toBe(1000)
})

it('does not expose private associated loan balances through shared asset equity', async () => {
  const f = await setup(false),
    actor = await testUser(f.app, 'SharedViewer'),
    member = f.grant(actor.id, 'viewer'),
    loan = (await f.ok('POST', '/debts', debt(f.member))).debt
  await f.ok(
    'POST',
    '/assets',
    create({
      name: 'Fictional shared car',
      category: 'vehicle',
      memberIds: [f.member, member],
      debtIds: [loan.id],
      acquisitionDate: null,
      purchaseCents: null,
      notes: null,
      status: 'active',
      valuation: {
        valueCents: 200000,
        valuationDate: '2026-10-01',
        source: 'Fictional value',
        confidence: 'estimated',
        notes: null,
        supersedesId: null,
      },
    }),
  )
  const r = (await f.ok('POST', '/reports/preview', filters, actor.cookie)) as FinancialReport
  expect(find(r, 'Debt balances as of report end')).toHaveLength(0)
  expect(find(r, 'Assets and equity')[0].equityCents).toBe(null)
  expect(find(r, 'Net worth subtotal')[0].incomplete).toBe(true)
  expect(r.notes.join(' ')).toContain('outside this export permission scope')
})
