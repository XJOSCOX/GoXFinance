import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup, create, edit } from '../trading/trading.fixture'
import { testUser, testRequest } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import type { BudgetInput } from '@goxfinance/shared'
const input = (categoryId: string, member: string | null = null): BudgetInput => ({
  month: '2026-10',
  responsibleMemberId: member,
  totalCents: 50000,
  status: 'active',
  notes: 'Fictional budget',
  limits: [{ categoryId, amountCents: 20000 }],
})
it.each([false, true])(
  'creates, edits, archives, restores and copies independent months with persistence; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      category = (await f.ok('GET', '/categories')).categories[0],
      values = input(category.id),
      body = create(values)
    const saved = (await f.ok('POST', '/budgets', body)).record
    expect((await f.ok('POST', '/budgets', body)).record.id).toBe(saved.id)
    expect((await f.send('POST', '/budgets', create(values))).statusCode).toBe(409)
    const copy = create({ sourceId: saved.id, sourceRevision: 1, month: '2026-11' })
    const november = (await f.ok('POST', '/budgets/copy', copy)).record
    expect((await f.ok('POST', '/budgets/copy', copy)).record.id).toBe(november.id)
    await f.ok(
      'PATCH',
      '/budgets/' + saved.id,
      edit(1, { ...values, totalCents: 60000, limits: [] }),
    )
    expect((await f.send('PATCH', '/budgets/' + saved.id, edit(1, values))).statusCode).toBe(409)
    await f.ok('PATCH', '/budgets/' + saved.id, edit(2, { ...values, status: 'archived' }))
    expect((await f.ok('GET', '/budgets?month=2026-10')).remainingCents).toBeNull()
    await f.ok('PATCH', '/budgets/' + saved.id, edit(3, values))
    const next = await f.restart(),
      report = (
        await testRequest(next, 'GET', f.base + '/budgets?month=2026-11', f.owner.cookie)
      ).json()
    expect(report.budget).toMatchObject({
      id: november.id,
      month: '2026-11',
      totalCents: 50000,
      revision: 1,
      limits: [{ categoryId: category.id, amountCents: 20000 }],
    })
    expect(report.previous.plannedCents).toBe(50000)
    const audit = (
      await testRequest(next, 'GET', f.base + '/budgets/' + saved.id + '/audit', f.owner.cookie)
    ).json().audit
    expect(audit).toHaveLength(4)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  },
  20000,
)
it('recalculates split purchases and paid standalone bills, preserving actual liability separately', async () => {
  const f = await setup(false),
    categories = (await f.ok('GET', '/categories')).categories,
    category = categories[0],
    other = categories[1]
  await f.ok('POST', '/budgets', create(input(category.id)))
  const e = {
    responsibleMemberId: f.member,
    description: 'Fictional split purchase',
    merchant: null,
    amountCents: 10000,
    transactionDate: '2026-10-01',
    paymentMethod: 'credit_card',
    linkedDebtId: null,
    notes: null,
    allocations: [
      { categoryId: category.id, amountCents: 6000 },
      { categoryId: other.id, amountCents: 4000 },
    ],
  }
  const expense = (await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense: e }))
    .expense
  const bill = (
    await f.ok('POST', '/bills', {
      name: 'Fictional utility',
      category: category.name,
      categoryId: category.id,
      kind: 'recurring',
      amountType: 'variable',
      amountCents: null,
      estimatedAmountCents: 30000,
      frequency: 'monthly',
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: null,
      memberIds: [f.member],
    })
  ).bill
  const period = bill.periods.find((p: { dueDate: string }) => p.dueDate === '2026-10-01')
  await f.ok('POST', '/bills/' + bill.id + '/actions', {
    action: 'edit_period',
    periodId: period.id,
    changes: { amountCents: 34218, creditCents: 0, notes: null },
  })
  const pending = (
    await f.ok('POST', `/bills/${bill.id}/periods/${period.id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: 20000,
      paymentDate: '2026-10-02',
      method: 'bank_transfer',
      notes: null,
      status: 'pending',
    })
  ).bill.payments[0]
  expect((await f.ok('GET', '/budgets?month=2026-10')).actualCents).toBe(10000)
  await f.ok('POST', '/bills/' + bill.id + '/actions', {
    action: 'confirm_payment',
    paymentId: pending.id,
  })
  const report = await f.ok('GET', '/budgets?month=2026-10')
  expect(report.actualCents).toBe(30000)
  expect(
    report.rows.find((r: { categoryId: string }) => r.categoryId === category.id),
  ).toMatchObject({ actualCents: 26000, status: 'Over Budget', overCents: 6000 })
  expect(report.bills.find((r: { id: string }) => r.id === period.id)).toMatchObject({
    estimateCents: 30000,
    billedCents: 34218,
    paidCents: 20000,
    remainingCents: 14218,
  })
  await f.ok('PATCH', '/expenses/' + expense.id, {
    revision: 1,
    expense: {
      ...e,
      amountCents: 5000,
      allocations: [{ categoryId: category.id, amountCents: 5000 }],
    },
  })
  expect((await f.ok('GET', '/budgets?month=2026-10')).actualCents).toBe(25000)
  await f.ok('DELETE', '/expenses/' + expense.id, { revision: 2 })
  await f.ok('POST', '/bills/' + bill.id + '/actions', {
    action: 'cancel_payment',
    paymentId: pending.id,
  })
  expect((await f.ok('GET', '/budgets?month=2026-10')).actualCents).toBe(0)
})
it('enforces Owner, own-member Admin/Editor, read-only Viewer and household isolation', async () => {
  const f = await setup(false),
    category = (await f.ok('GET', '/categories')).categories[0],
    values = input(category.id),
    owner = (await f.ok('POST', '/budgets', create({ ...values, responsibleMemberId: f.member })))
      .record
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role),
      member = f.grant(actor.id, role)
    expect(
      (await f.send('POST', '/budgets', create({ ...values, month: '2026-11' }), actor.cookie))
        .statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'PATCH',
          '/budgets/' + owner.id,
          edit(1, { ...values, responsibleMemberId: f.member }),
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await f.send('POST', '/budgets', create(input(category.id, member)), actor.cookie))
        .statusCode,
    ).toBe(role === 'viewer' ? 403 : 200)
    expect((await f.ok('GET', '/budgets?month=2026-10', undefined, actor.cookie)).budget).toBeNull()
  }
  const outsider = await testUser(f.app, 'Outside')
  expect(
    (await f.send('GET', '/budgets?month=2026-10', undefined, outsider.cookie)).statusCode,
  ).toBe(404)
  expect(
    (await f.send('POST', '/budgets', create({ ...values, responsibleMemberId: randomUUID() })))
      .statusCode,
  ).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/budgets',
        create({ ...values, limits: [{ categoryId: randomUUID(), amountCents: 1 }] }),
      )
    ).statusCode,
  ).toBe(400)
})
it('retains archived category limits, rejects new archived assignments and rolls back a failed update', async () => {
  const f = await setup(false),
    category = (await f.ok('POST', '/categories', { name: 'Fictional custom budget category' }))
      .category,
    values = input(category.id),
    saved = (await f.ok('POST', '/budgets', create(values))).record
  await f.ok('PATCH', '/categories/' + category.id, {
    name: category.name,
    description: null,
    icon: null,
    archived: true,
    revision: 1,
  })
  expect((await f.ok('GET', '/budgets?month=2026-10')).rows[0].archived).toBe(true)
  expect(
    (await f.send('POST', '/budgets', create({ ...values, month: '2026-12' }))).statusCode,
  ).toBe(400)
  await f.ok(
    'POST',
    '/budgets/copy',
    create({ sourceId: saved.id, sourceRevision: 1, month: '2026-11' }),
  )
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_budget_update BEFORE UPDATE ON budget_category_limits BEGIN SELECT RAISE(ABORT,'Fictional failure'); END",
    )
    expect(
      (await f.send('PATCH', '/budgets/' + saved.id, edit(1, { ...values, totalCents: 99999 })))
        .statusCode,
    ).toBeGreaterThanOrEqual(400)
    const after = (await f.ok('GET', '/budgets?month=2026-10')).budget
    expect(after).toMatchObject({ revision: 1, totalCents: 50000 })
    expect((await f.ok('GET', '/budgets/' + saved.id + '/audit')).audit).toHaveLength(1)
  } finally {
    db.close()
  }
})

it('keeps a tracked credit-card purchase once while excluding completed debt-linked repayments', async () => {
  const f = await setup(false),
    category = (await f.ok('GET', '/categories')).categories[0]
  const debt = (
    await f.ok('POST', '/debts', {
      creditorName: 'Fictional credit card',
      accountType: 'credit_card',
      currentBalanceCents: 50000,
      memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
    })
  ).debt
  const expense = {
    responsibleMemberId: f.member,
    description: 'Fictional card purchase',
    merchant: null,
    amountCents: 10000,
    transactionDate: '2026-10-01',
    paymentMethod: 'credit_card',
    linkedDebtId: debt.id,
    notes: null,
    allocations: [{ categoryId: category.id, amountCents: 10000 }],
  }
  await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense })
  const bill = (
    await f.ok('POST', '/bills', {
      name: 'Fictional card repayment',
      category: category.name,
      categoryId: category.id,
      kind: 'recurring',
      amountType: 'fixed',
      amountCents: 10000,
      estimatedAmountCents: null,
      frequency: 'monthly',
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: debt.id,
      memberIds: [f.member],
    })
  ).bill
  await f.ok('POST', `/bills/${bill.id}/periods/${bill.periods[0].id}/payments`, {
    idempotencyKey: randomUUID(),
    amountCents: 10000,
    paymentDate: '2026-10-02',
    method: 'bank_transfer',
    notes: null,
    status: 'completed',
  })
  expect((await f.ok('GET', '/budgets?month=2026-10')).actualCents).toBe(10000)
  expect((await f.ok('GET', '/debts/' + debt.id + '/payments')).payments).toHaveLength(1)
})

it('enforces scope uniqueness, integer cents and category foreign keys in SQLite itself', async () => {
  const f = await setup(false),
    category = (await f.ok('GET', '/categories')).categories[0],
    saved = (await f.ok('POST', '/budgets', create(input(category.id)))).record
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.pragma('foreign_keys=ON')
    expect(() =>
      db.prepare('UPDATE budget_months SET total_cents=? WHERE id=?').run(1.5, saved.id),
    ).toThrow()
    expect(() =>
      db.prepare('UPDATE budget_months SET scope_key=? WHERE id=?').run('wrong-scope', saved.id),
    ).toThrow()
    expect(() =>
      db
        .prepare(
          'INSERT INTO budget_category_limits(id,household_id,budget_id,category_id,amount_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          f.home,
          saved.id,
          randomUUID(),
          1,
          '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z',
        ),
    ).toThrow()
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally {
    db.close()
  }
})
