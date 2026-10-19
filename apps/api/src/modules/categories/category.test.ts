import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { testHome, testRequest, testUser } from '../../testing/workspace'
import { setup } from './category.fixture'

it.each([false, true])(
  'persists shared categories, names, archival, restoration and optimistic edits (encrypted=%s)',
  async (encrypted) => {
    const f = await setup(encrypted)
    const initial = await f.ok('GET', '/categories')
    expect(initial.categories).toHaveLength(20)
    const housing = initial.categories.find((item: { name: string }) => item.name === 'Housing')
    await f.ok('PATCH', `/categories/${housing.id}`, {
      name: 'Home costs',
      description: null,
      icon: null,
      archived: false,
      revision: housing.revision,
    })
    await f.ok('POST', '/expenses/initialize', {})
    expect(
      (await f.ok('GET', '/categories')).categories.some(
        (item: { name: string }) => item.name === 'Housing',
      ),
    ).toBe(false)
    const category = (
      await f.ok('POST', '/categories', {
        name: 'Example custom',
        description: 'Fictional category',
        icon: 'home',
      })
    ).category
    expect((await f.send('POST', '/categories', { name: '  EXAMPLE CUSTOM  ' })).statusCode).toBe(
      409,
    )
    const archived = (
      await f.ok('PATCH', `/categories/${category.id}`, {
        name: 'Renamed example',
        description: null,
        icon: null,
        archived: true,
        revision: 1,
      })
    ).category
    expect(archived.archived).toBe(true)
    expect(
      (
        await f.send('PATCH', `/categories/${category.id}`, {
          name: 'Stale',
          description: null,
          icon: null,
          archived: false,
          revision: 1,
        })
      ).statusCode,
    ).toBe(409)
    await f.ok('PATCH', `/categories/${category.id}`, {
      name: archived.name,
      description: 'Restored',
      icon: 'car',
      archived: false,
      revision: 2,
    })
    const reopened = await f.restart()
    const result = await testRequest(reopened, 'GET', f.base + '/categories', f.owner.cookie)
    expect(
      result.json().categories.find((item: { id: string }) => item.id === category.id),
    ).toMatchObject({ description: 'Restored', icon: 'car', archived: false, revision: 3 })
  },
)

it('enforces Owner-only category management and cross-household assignment isolation', async () => {
  const f = await setup(false),
    category = (await f.ok('GET', '/categories')).categories[0]
  for (const role of ['admin', 'editor', 'viewer']) {
    const user = await testUser(f.app, role)
    f.grant(user.id, role)
    expect((await f.send('GET', '/categories', undefined, user.cookie)).statusCode).toBe(200)
    expect(
      (await f.send('POST', '/categories', { name: 'Forbidden' }, user.cookie)).statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'PATCH',
          `/categories/${category.id}`,
          { name: category.name, description: null, icon: null, archived: true, revision: 1 },
          user.cookie,
        )
      ).statusCode,
    ).toBe(403)
  }
  const other = await testUser(f.app, 'Other'),
    foreign = await testHome(f.app, other.cookie)
  expect((await f.send('GET', '/categories', undefined, other.cookie)).statusCode).toBe(404)
  const foreignCategory = (
    await testRequest(f.app, 'GET', `/api/households/${foreign.home}/categories`, other.cookie)
  ).json().categories[0]
  expect(
    (await f.send('GET', '/categories/report?month=2026-10', undefined, other.cookie)).statusCode,
  ).toBe(404)
  expect(
    (
      await f.send('POST', '/debts', {
        creditorName: 'Example loan',
        accountType: 'personal_loan',
        categoryId: foreignCategory.id,
        memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
      })
    ).statusCode,
  ).toBe(400)
  const ownDebt = (
    await f.ok('POST', '/debts', {
      creditorName: 'Example local debt',
      accountType: 'personal_loan',
      categoryId: category.id,
      memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
    })
  ).debt
  const ownBill = (
    await f.ok('POST', '/bills', {
      name: 'Example local bill',
      category: category.name,
      categoryId: category.id,
      kind: 'one_time',
      amountType: 'fixed',
      amountCents: 10000,
      estimatedAmountCents: null,
      frequency: null,
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: null,
      memberIds: [f.member],
    })
  ).bill
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    for (const [table, id] of [
      ['debts', ownDebt.id],
      ['bills', ownBill.id],
      ['bill_periods', ownBill.periods[0].id],
    ]) {
      expect(() =>
        sqlite.prepare(`UPDATE ${table} SET category_id=? WHERE id=?`).run(foreignCategory.id, id),
      ).toThrow('Category must belong to the same household')
    }
  } finally {
    sqlite.close()
  }
})

it.each(['admin', 'editor'] as const)(
  'requires Owner approval for joint debt category changes from %s and revalidates archived targets',
  async (role) => {
    const f = await setup(false),
      admin = await testUser(f.app, role),
      adminMember = f.grant(admin.id, role)
    const categories = (await f.ok('GET', '/categories')).categories
    const debt = (
      await f.ok('POST', '/debts', {
        creditorName: 'Example joint loan',
        accountType: 'auto_loan',
        categoryId: categories[0].id,
        memberAssignments: [f.member, adminMember].map((memberId) => ({
          memberId,
          responsibility: 'joint',
        })),
      })
    ).debt
    expect(
      (await f.send('PATCH', `/debts/${debt.id}`, { categoryId: categories[1].id }, admin.cookie))
        .statusCode,
    ).toBe(403)
    const request = await f.ok(
      'POST',
      `/debts/${debt.id}/change-requests`,
      {
        action: 'edit_account',
        changes: { categoryId: categories[1].id },
        reason: 'Choose appropriate category',
        idempotencyKey: randomUUID(),
      },
      admin.cookie,
    )
    await f.ok('POST', `/debt-change-requests/${request.requestId}/approve`, { confirmed: true })
    expect((await f.ok('GET', '/debts')).debts[0].categoryId).toBe(categories[1].id)
    const second = await f.ok(
      'POST',
      `/debts/${debt.id}/change-requests`,
      {
        action: 'edit_account',
        changes: { categoryId: categories[2].id },
        reason: 'Proposed category',
        idempotencyKey: randomUUID(),
      },
      admin.cookie,
    )
    await f.ok('PATCH', `/categories/${categories[2].id}`, {
      name: categories[2].name,
      description: null,
      icon: null,
      archived: true,
      revision: 1,
    })
    expect(
      (
        await f.send('POST', `/debt-change-requests/${second.requestId}/approve`, {
          confirmed: true,
        })
      ).statusCode,
    ).toBe(400)
    expect((await f.ok('GET', '/debts')).debts[0].categoryId).toBe(categories[1].id)
  },
)

it.each([false, true])(
  'shares bills and splits while preserving historical assignments (encrypted=%s)',
  async (encrypted) => {
    const f = await setup(encrypted),
      category = (await f.ok('POST', '/categories', { name: 'Custom utility' })).category
    const other = (await f.ok('GET', '/categories')).categories.find(
      (item: { name: string }) => item.name === 'Other',
    )
    const bill = (
      await f.ok('POST', '/bills', {
        name: 'Example bill',
        category: category.name,
        categoryId: category.id,
        kind: 'one_time',
        amountType: 'fixed',
        amountCents: 12345,
        estimatedAmountCents: null,
        frequency: null,
        nextDueDate: '2026-10-01',
        endDate: null,
        autoPay: false,
        status: 'active',
        notes: null,
        linkedDebtId: null,
        memberIds: [f.member],
      })
    ).bill
    const expense = {
      description: 'Example split',
      merchant: null,
      responsibleMemberId: f.member,
      amountCents: 10000,
      transactionDate: '2026-10-01',
      paymentMethod: 'debit_card',
      linkedDebtId: null,
      notes: null,
      allocations: [
        { categoryId: category.id, amountCents: 4000 },
        { categoryId: other.id, amountCents: 6000 },
      ],
    }
    const saved = (await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense }))
      .expense
    await f.ok('PATCH', `/categories/${category.id}`, {
      name: 'Renamed utility',
      description: null,
      icon: null,
      archived: true,
      revision: 1,
    })
    const historical = (await f.ok('GET', `/bills/${bill.id}`)).bill
    expect(historical.periods[0]).toMatchObject({
      category: 'Custom utility',
      categoryId: category.id,
      amountCents: 12345,
    })
    expect((await f.ok('GET', `/expenses/${saved.id}`)).expense.allocations).toEqual(
      saved.allocations,
    )
    expect(
      (await f.send('POST', '/expenses', { idempotencyKey: randomUUID(), expense })).statusCode,
    ).toBe(400)
    await f.ok('PATCH', `/expenses/${saved.id}`, {
      expense: { ...expense, notes: 'Correction without recategorizing' },
      revision: 1,
    })
    const usage = (await f.ok('GET', '/categories')).categories.find(
      (item: { id: string }) => item.id === category.id,
    ).usage
    expect(usage).toEqual({ bills: 1, billPeriods: 1, debts: 0, expenses: 1 })
    const report = await f.ok('GET', '/categories/report?month=2026-10')
    expect(
      report.rows.find((row: { categoryId: string }) => row.categoryId === category.id),
    ).toMatchObject({ spendingCents: 4000, cashOutflowCents: 4000, debtBalanceCents: 0 })
  },
)
