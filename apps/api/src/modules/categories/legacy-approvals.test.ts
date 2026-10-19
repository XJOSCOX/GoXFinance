import { expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { testUser } from '../../testing/workspace'
import { setup } from './category.fixture'

it('allows an unchanged legacy debt request to be approved after category fields are added', async () => {
  const f = await setup(false),
    admin = await testUser(f.app, 'Admin'),
    adminMember = f.grant(admin.id, 'admin')
  const debt = (
    await f.ok('POST', '/debts', {
      creditorName: 'Legacy example',
      accountType: 'auto_loan',
      memberAssignments: [f.member, adminMember].map((memberId) => ({
        memberId,
        responsibility: 'joint',
      })),
    })
  ).debt
  const request = await f.ok(
    'POST',
    `/debts/${debt.id}/change-requests`,
    {
      action: 'edit_account',
      changes: { accountNickname: 'Approved legacy nickname' },
      reason: 'Legacy proposal',
      idempotencyKey: randomUUID(),
    },
    admin.cookie,
  )
  const original = (await f.ok('GET', `/debts/${debt.id}`)).debt,
    balances = (await f.ok('GET', `/debts/${debt.id}/balances`)).history
  const legacy = JSON.stringify({ debt: original, balances }, (key, value) =>
    key === 'categoryId' ? undefined : value,
  )
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    sqlite.prepare('UPDATE debt_change_requests SET base_hash=?,original_json=? WHERE id=?').run(
      createHash('sha256').update(legacy).digest('hex'),
      JSON.stringify(original, (key, value) => (key === 'categoryId' ? undefined : value)),
      request.requestId,
    )
  } finally {
    sqlite.close()
  }
  await f.ok('POST', `/debt-change-requests/${request.requestId}/approve`, { confirmed: true })
  expect((await f.ok('GET', `/debts/${debt.id}`)).debt.accountNickname).toBe(
    'Approved legacy nickname',
  )
})

it('preserves approval of legacy bill requests without relaxing revisions or amount checks', async () => {
  const f = await setup(false),
    admin = await testUser(f.app, 'Admin'),
    adminMember = f.grant(admin.id, 'admin')
  const bill = (
    await f.ok('POST', '/bills', {
      name: 'Legacy joint bill',
      category: 'Other',
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
      memberIds: [f.member, adminMember],
    })
  ).bill
  const request = await f.ok(
    'POST',
    `/bills/${bill.id}/requests`,
    {
      idempotencyKey: randomUUID(),
      reason: 'Legacy bill proposal',
      proposal: { action: 'archive_bill' },
    },
    admin.cookie,
  )
  const view = (await f.ok('GET', `/bills/${bill.id}`)).bill
  const rawBill = Object.fromEntries(
    Object.entries(view).filter(
      ([key]) => !['canManage', 'requiresApproval', 'payments', 'periods'].includes(key),
    ),
  )
  const periods = view.periods.map((period: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(period).filter(
        ([key]) =>
          ![
            'paidCents',
            'remainingCents',
            'overpaidCents',
            'amountIsEstimate',
            'paymentStatus',
            'overdue',
          ].includes(key),
      ),
    ),
  )
  const state = { bill: rawBill, periods, payments: view.payments }
  const legacy = JSON.stringify({ ...state, debts: [], linkedPaymentAudit: [] }, (key, value) =>
    key === 'categoryId' ? undefined : value,
  )
  const sqlite = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    sqlite.prepare('UPDATE bill_change_requests SET base_hash=?,original_json=? WHERE id=?').run(
      createHash('sha256').update(legacy).digest('hex'),
      JSON.stringify(state, (key, value) => (key === 'categoryId' ? undefined : value)),
      request.id,
    )
  } finally {
    sqlite.close()
  }
  await f.ok('POST', `/bills/requests/${request.id}/review`, { action: 'approve' })
  expect((await f.ok('GET', `/bills/${bill.id}`)).bill.status).toBe('cancelled')
})
