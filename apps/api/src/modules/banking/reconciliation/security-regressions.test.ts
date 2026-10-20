import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { reviewFixture } from './review.fixture'
import { testRequest } from '../../../testing/workspace'
const breakdown = { principalAmountCents: null, interestAmountCents: null, feesAmountCents: null }
it.each([false, true])(
  'links a pre-existing debt payment to a bill without another payment and persists; encrypted=%s',
  async (encrypted) => {
    const f = await reviewFixture(encrypted)
    const debt = (
      await f.ok('POST', '/debts', {
        creditorName: 'Fictional existing lender',
        accountType: 'auto_loan',
        currentBalanceCents: 1000000,
        memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
      })
    ).debt
    const payment = (
      await f.ok('POST', `/debts/${debt.id}/payments`, {
        idempotencyKey: randomUUID(),
        amountCents: 66500,
        paymentDate: '2026-10-01',
        paymentStatus: 'completed',
        paymentMethod: 'bank_transfer',
        ...breakdown,
      })
    ).payment
    const bill = (
      await f.ok('POST', '/bills', {
        name: 'Fictional loan reference',
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
    ).bill
    const tx = await f.importRow('-665', 'Fictional posted loan payment', '2026-10-02')
    const proposal = {
      classification: 'bill_payment' as const,
      billId: bill.id,
      periodId: bill.periods[0].id,
      paymentId: null,
      existingDebtPaymentId: payment.id,
      billedAmountCents: null,
      ...breakdown,
    }
    const { submission } = await f.review(tx.id, proposal)
    expect(
      await f.ok('POST', `/banking/transactions/${tx.id}/reconcile`, submission),
    ).toMatchObject({ replayed: true })
    expect((await f.ok('GET', `/debts/${debt.id}/payments`)).payments).toHaveLength(1)
    const saved = (await f.ok('GET', `/bills/${bill.id}`)).bill
    expect(saved.payments).toHaveLength(1)
    expect(saved.payments[0]).toMatchObject({
      debtPaymentId: payment.id,
      paymentDate: '2026-10-01',
    })
    expect(saved.periods[0]).toMatchObject({ remainingCents: 0, paidCents: 66500 })
    expect((await f.ok('GET', '/overview?month=2026-10')).actual).toMatchObject({
      cashOutflowCents: 66500,
      spendingCents: 0,
    })
    expect((await f.ok('GET', `/debts/${debt.id}`)).debt.currentBalanceCents).toBe(1000000)
    const second = await f.importRow('-665', 'Fictional duplicate loan payment', '2026-10-03')
    expect(
      (
        await f.send('POST', `/banking/transactions/${second.id}/preview`, {
          revision: 1,
          proposal,
        })
      ).statusCode,
    ).toBe(409)
    const next = await f.restart()
    expect(
      (await testRequest(next, 'GET', f.base + `/bills/${bill.id}`, f.owner.cookie)).json().bill
        .payments[0].debtPaymentId,
    ).toBe(payment.id)
  },
)
it('restricts refund category reversals and rolls back an over-refund atomically', async () => {
  const f = await reviewFixture(),
    purchase = await f.importRow('-42.18')
  const proposal = await f.expenseProposal(purchase.id)
  if (proposal.classification !== 'expense' || !proposal.expense) throw new Error('fixture')
  const options = await f.ok('GET', `/banking/transactions/${purchase.id}/review`)
  const a = options.categories[0].id,
    b = options.categories[1].id,
    c = options.categories[2].id
  proposal.expense.allocations = [
    { categoryId: a, amountCents: 2000 },
    { categoryId: b, amountCents: 2218 },
  ]
  await f.review(purchase.id, proposal)
  const expense = (await f.ok('GET', '/expenses')).expenses[0]
  const refund = await f.importRow('25', 'Fictional split refund', '2026-10-02')
  const base = {
    classification: 'refund' as const,
    originalType: 'expense' as const,
    originalId: expense.id,
  }
  // Preview validation is read-only; final constraints must roll back the review and ledger together.
  for (const allocations of [
    [{ categoryId: c, amountCents: 2500 }],
    [{ categoryId: a, amountCents: 2500 }],
  ]) {
    const p = { ...base, allocations },
      preview = await f.ok('POST', `/banking/transactions/${refund.id}/preview`, {
        revision: 1,
        proposal: p,
      })
    expect(
      (
        await f.send('POST', `/banking/transactions/${refund.id}/reconcile`, {
          revision: 1,
          proposal: p,
          fingerprint: preview.fingerprint,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409)
    expect((await f.ok('GET', `/banking/transactions/${refund.id}/review`)).refund).toBeUndefined()
  }
  await f.review(refund.id, {
    ...base,
    allocations: [
      { categoryId: a, amountCents: 2000 },
      { categoryId: b, amountCents: 500 },
    ],
  })
  const another = await f.importRow('1', 'Fictional exhausted category', '2026-10-03')
  const p = { ...base, allocations: [{ categoryId: a, amountCents: 100 }] },
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
  expect((await f.ok('GET', '/overview?month=2026-10')).actual.spendingCents).toBe(1718)
})
