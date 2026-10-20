import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { bankAccountSchema, type BankProposal } from '@goxfinance/shared'
import { reviewFixture } from './review.fixture'
import { create } from '../../trading/trading.fixture'
import { openSqlite } from '../../../db/encryption/sqlite-engine'
const breakdown = { principalAmountCents: null, interestAmountCents: null, feesAmountCents: null }
it.each([false, true])(
  'preserves a variable estimate, confirms the actual bill, records partial payment once, and applies a dated refund; encrypted=%s',
  async (encrypted) => {
    const f = await reviewFixture(encrypted),
      bill = (
        await f.ok('POST', '/bills', {
          name: 'Fictional electricity',
          category: 'Utilities',
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
      ).bill,
      tx = await f.importRow('-200', 'Fictional utility payment'),
      period = bill.periods[0]
    await f.review(tx.id, {
      classification: 'bill_payment',
      billId: bill.id,
      periodId: period.id,
      paymentId: null,
      billedAmountCents: 34218,
      ...breakdown,
    })
    const current = (await f.ok('GET', '/bills/' + bill.id)).bill
    expect(current.periods[0]).toMatchObject({
      amountCents: 34218,
      budgetEstimateCents: 30000,
      paidCents: 20000,
      remainingCents: 14218,
      paymentStatus: 'partially_paid',
    })
    const refund = await f.importRow('50', 'Fictional utility refund', '2026-10-02'),
      options = await f.ok('GET', `/banking/transactions/${refund.id}/review`)
    await f.review(refund.id, {
      classification: 'refund',
      originalType: 'bill_payment',
      originalId: current.payments[0].id,
      allocations: [{ categoryId: options.categories[0].id, amountCents: 5000 }],
    })
    const after = (await f.ok('GET', '/bills/' + bill.id)).bill
    expect(after.periods[0]).toMatchObject({ paidCents: 15000, remainingCents: 19218 })
    expect((await f.ok('GET', '/overview?month=2026-10')).actual).toMatchObject({
      cashOutflowCents: 15000,
      spendingCents: 15000,
    })
    expect(
      (
        await f.send('POST', `/bills/${bill.id}/actions`, {
          action: 'cancel_payment',
          paymentId: current.payments[0].id,
        })
      ).statusCode,
    ).toBe(409)
    const reviewed = await f.ok('GET', `/banking/transactions/${refund.id}/review`)
    await f.ok('POST', `/banking/refunds/${reviewed.refund.id}/cancel`, {
      revision: reviewed.transaction.revision,
    })
    expect((await f.ok('GET', '/overview?month=2026-10')).actual.cashOutflowCents).toBe(20000)
    await f.ok('POST', `/bills/${bill.id}/actions`, {
      action: 'cancel_payment',
      paymentId: current.payments[0].id,
    })
    expect((await f.ok('GET', '/overview?month=2026-10')).actual.cashOutflowCents).toBe(0)
  },
)
it('links one authoritative debt payment through a bill alias, without principal assumptions or duplicate cash outflow', async () => {
  const f = await reviewFixture(),
    debt = (
      await f.ok('POST', '/debts', {
        creditorName: 'Fictional auto lender',
        accountType: 'auto_loan',
        currentBalanceCents: 1000000,
        memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
      })
    ).debt,
    bill = (
      await f.ok('POST', '/bills', {
        name: 'Fictional loan obligation',
        category: 'Transportation',
        kind: 'recurring',
        amountType: 'fixed',
        amountCents: 66500,
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
    ).bill,
    tx = await f.importRow('-665', 'Fictional loan payment')
  await f.review(tx.id, {
    classification: 'bill_payment',
    billId: bill.id,
    periodId: bill.periods[0].id,
    paymentId: null,
    billedAmountCents: null,
    ...breakdown,
  })
  const payments = (await f.ok('GET', `/debts/${debt.id}/payments`)).payments
  expect(payments).toHaveLength(1)
  expect(payments[0].principalAmountCents).toBeNull()
  expect((await f.ok('GET', '/debts/' + debt.id)).debt.currentBalanceCents).toBe(1000000)
  expect((await f.ok('GET', '/overview?month=2026-10')).actual).toMatchObject({
    cashOutflowCents: 66500,
    spendingCents: 0,
  })
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    expect(
      db
        .prepare(
          'SELECT debt_payment_id,bill_payment_id FROM bank_reconciliations WHERE transaction_id=?',
        )
        .get(tx.id),
    ).toEqual({ debt_payment_id: payments[0].id, bill_payment_id: null })
  } finally {
    db.close()
  }
  const another = await f.importRow('-665', 'Fictional duplicate reference')
  const p: BankProposal = {
      classification: 'debt_payment',
      debtId: debt.id,
      paymentId: payments[0].id,
      ...breakdown,
    },
    preview = await f.ok('POST', `/banking/transactions/${another.id}/preview`, {
      revision: 1,
      proposal: p,
    })
  expect(
    (
      await f.send('POST', `/banking/transactions/${another.id}/reconcile`, {
        revision: 1,
        proposal: p,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(409)
  expect((await f.ok('GET', `/debts/${debt.id}/payments`)).payments).toHaveLength(1)
})
it('confirms an existing pending paycheck rather than creating duplicate income; separates gross and bank deposits', async () => {
  const f = await reviewFixture(),
    source = (
      await f.ok(
        'POST',
        '/income/sources',
        create({
          name: 'Fictional payroll',
          responsibleMemberId: f.member,
          incomeType: 'hourly',
          frequency: 'weekly',
          hourlyRateCents: 2500,
          expectedGrossCents: null,
          expectedNetCents: null,
          payday: 4,
          overtimeMultiplier: '1.5',
          status: 'active',
          notes: null,
        }),
      )
    ).source,
    values = {
      sourceId: source.id,
      workPeriodStart: '2026-09-21',
      workPeriodEnd: '2026-09-27',
      regularHours: '30',
      overtimeHours: null,
      hourlyRateCents: 2500,
      overtimeMultiplier: '1.5',
      expectedGrossCents: null,
      expectedNetCents: 60000,
      actualGrossCents: null,
      deductionsCents: null,
      actualNetCents: null,
      payDate: '2026-10-01',
      depositDate: null,
      status: 'pending',
      reference: null,
      notes: null,
      receiptConfirmed: false,
      tradingPayoutWithdrawn: false,
    },
    pending = (await f.ok('POST', '/income/transactions', create(values))).transaction,
    tx = await f.importRow('600', 'Fictional payroll deposit')
  const options = await f.ok('GET', `/banking/transactions/${tx.id}/review`)
  expect(options.matches).toEqual(
    expect.arrayContaining([expect.objectContaining({ classification: 'income', id: pending.id })]),
  )
  await f.review(tx.id, {
    classification: 'income',
    sourceId: source.id,
    transactionId: pending.id,
    confirmPending: true,
    actualGrossCents: 75000,
    deductionsCents: 15000,
  })
  const income = (await f.ok('GET', '/income')).transactions
  expect(income).toHaveLength(1)
  expect(income[0]).toMatchObject({
    id: pending.id,
    actualGrossCents: 75000,
    actualNetCents: 60000,
    status: 'confirmed',
    depositDate: '2026-10-01',
  })
  expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(60000)
})
it('tracks internal transfers without income and credit-card purchases/refunds without cash outflows', async () => {
  const f = await reviewFixture(),
    savings = (
      await f.ok(
        'POST',
        '/banking/accounts',
        create({
          ...bankAccountSchema.strip().parse(f.account),
          name: 'Fictional savings',
          type: 'savings',
        }),
      )
    ).record,
    out = await f.importRow('-100', 'Fictional transfer out'),
    into = await f.importRow('100', 'Fictional transfer in', '2026-10-01', savings.id)
  await f.review(out.id, { classification: 'transfer', counterpartId: into.id })
  await f.review(into.id, { classification: 'transfer', counterpartId: out.id })
  const credit = (
      await f.ok(
        'POST',
        '/banking/accounts',
        create({
          ...bankAccountSchema.strip().parse(f.account),
          name: 'Fictional credit card',
          type: 'credit_card',
        }),
      )
    ).record,
    purchase = await f.importRow('-42.18', 'Fictional credit purchase', '2026-10-01', credit.id)
  await f.review(purchase.id, await f.expenseProposal(purchase.id, 4218, f.member, true))
  const expense = (await f.ok('GET', '/expenses')).expenses[0],
    refund = await f.importRow('2.18', 'Fictional credit refund', '2026-10-02', credit.id)
  await f.review(refund.id, {
    classification: 'refund',
    originalType: 'expense',
    originalId: expense.id,
    allocations: [{ categoryId: expense.allocations[0].categoryId, amountCents: 218 }],
  })
  const overview = await f.ok('GET', '/overview?month=2026-10')
  expect(overview.actual).toMatchObject({ spendingCents: 4000, cashOutflowCents: 0 })
  expect(overview.income.confirmedCents).toBe(0)
})
