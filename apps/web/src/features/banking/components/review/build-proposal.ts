import {
  bankProposalSchema,
  bankDecimalCents,
  type BankClassification,
  type BankReviewOptions,
} from '@goxfinance/shared'
export function buildBankProposal(
  kind: BankClassification,
  data: BankReviewOptions,
  form: FormData,
) {
  const text = (key: string) => String(form.get(key) ?? ''),
    id = (key: string) => text(key) || null,
    cents = (key: string) => (text(key).trim() ? bankDecimalCents(text(key)) : null),
    allocations = () =>
      form
        .getAll('categoryId')
        .map((categoryId, index) => ({
          categoryId: String(categoryId),
          amountCents: bankDecimalCents(String(form.getAll('allocation')[index])),
        })),
    breakdown = {
      principalAmountCents: cents('principal'),
      interestAmountCents: cents('interest'),
      feesAmountCents: cents('fees'),
    },
    t = data.transaction
  if (kind === 'expense' || kind === 'fee')
    return bankProposalSchema.parse({
      classification: kind,
      expenseId: id('expenseId'),
      expense: id('expenseId')
        ? null
        : {
            responsibleMemberId: text('memberId'),
            description: text('description'),
            merchant: id('merchant'),
            amountCents: Math.abs(t.amountCents),
            transactionDate: t.date,
            paymentMethod: data.account.type === 'credit_card' ? 'credit_card' : 'bank_transfer',
            linkedDebtId: data.account.type === 'credit_card' ? data.account.debtId : null,
            notes: id('notes'),
            allocations: allocations(),
          },
    })
  if (kind === 'bill_payment')
    return bankProposalSchema.parse({
      classification: kind,
      billId: text('billId'),
      periodId: text('periodId'),
      paymentId: id('paymentId'),
      billedAmountCents: form.has('confirmBilledAmount') ? cents('billedAmount') : null,
      ...breakdown,
    })
  if (kind === 'debt_payment')
    return bankProposalSchema.parse({
      classification: kind,
      debtId: text('debtId'),
      paymentId: id('paymentId'),
      ...breakdown,
    })
  if (kind === 'income')
    return bankProposalSchema.parse({
      classification: kind,
      sourceId: text('sourceId'),
      transactionId: id('transactionId'),
      confirmPending: form.has('receiptConfirmed'),
      actualGrossCents: cents('gross'),
      deductionsCents: cents('deductions'),
    })
  if (kind === 'transfer')
    return bankProposalSchema.parse({ classification: kind, counterpartId: id('counterpartId') })
  if (kind === 'refund')
    return bankProposalSchema.parse({
      classification: kind,
      originalType: text('originalType'),
      originalId: text('originalId'),
      allocations: allocations(),
    })
  return bankProposalSchema.parse({ classification: 'ignore', reason: text('reason') })
}
