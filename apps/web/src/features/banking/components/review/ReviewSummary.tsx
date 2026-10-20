import type { BankProposal, BankReviewOptions } from '@goxfinance/shared'
import { formatMoney } from '../../../../lib/money'
import { bankClassLabels } from './review-labels'
export function ReviewSummary({
  proposal: p,
  data,
}: {
  proposal: BankProposal
  data: BankReviewOptions
}) {
  const category = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Category',
    expense = (id: string) =>
      data.expenses.find((e) => e.id === id)?.description ?? 'Existing expense'
  let details: string[] = []
  if (p.classification === 'expense' || p.classification === 'fee')
    details = p.expense
      ? [
          `Create: ${p.expense.description}`,
          `Member: ${data.members.find((m) => m.id === p.expense?.responsibleMemberId)?.name ?? 'Household member'}`,
          ...p.expense.allocations.map(
            (a) => `${category(a.categoryId)} · ${formatMoney(a.amountCents)}`,
          ),
          ...(p.expense.notes ? [p.expense.notes] : []),
        ]
      : [`Link: ${expense(p.expenseId!)}`]
  if (p.classification === 'bill_payment')
    details = [
      data.bills.find((b) => b.id === p.billId)?.name ?? 'Bill',
      `Period: ${data.bills.find((b) => b.id === p.billId)?.periods.find((r) => r.id === p.periodId)?.dueDate ?? 'Selected period'}`,
      p.paymentId
        ? 'Link an existing completed payment'
        : p.existingDebtPaymentId
          ? 'Link the existing debt payment to this bill; no second payment is created'
          : 'Record one completed payment',
      ...(p.billedAmountCents !== null
        ? [`Also confirm actual billed amount: ${formatMoney(p.billedAmountCents)}`]
        : []),
    ]
  if (p.classification === 'debt_payment')
    details = [
      data.debts.find((d) => d.id === p.debtId)?.creditorName ?? 'Debt',
      p.paymentId
        ? 'Link an existing completed payment'
        : 'Record one completed payment — no automatic payoff or principal assumption',
    ]
  if ('principalAmountCents' in p) {
    const existing = data.payments.find(
      (v) => v.id === (p.classification === 'bill_payment' ? p.existingDebtPaymentId : p.paymentId),
    )
    details.push(
      `Principal ${formatMoney(existing ? existing.principalAmountCents : p.principalAmountCents)} · Interest ${formatMoney(existing ? existing.interestAmountCents : p.interestAmountCents)} · Fees ${formatMoney(existing ? existing.feesAmountCents : p.feesAmountCents)}`,
    )
  }
  if (p.classification === 'income')
    details = [
      data.income.sources.find((s) => s.id === p.sourceId)?.name ?? 'Income source',
      p.transactionId
        ? 'Link / confirm the selected existing deposit'
        : 'Create a confirmed net deposit',
      `Gross ${formatMoney(p.actualGrossCents)} · Deductions ${formatMoney(p.deductionsCents)}`,
    ]
  if (p.classification === 'transfer')
    details = [
      p.counterpartId
        ? 'Pair the selected opposite leg'
        : 'Unmatched transfer — other leg still needs review',
      'No income or purchase spending is created.',
    ]
  if (p.classification === 'refund')
    details = [
      `Adjustment against the selected ${p.originalType.replaceAll('_', ' ')}`,
      ...p.allocations.map((a) => `${category(a.categoryId)} · ${formatMoney(a.amountCents)}`),
      'Original records are preserved; no income is created.',
    ]
  if (p.classification === 'ignore')
    details = [p.reason, 'Imported record is retained outside accounting.']
  return (
    <section className="rounded-xl border border-[#adbcad]/25 bg-[#adbcad]/5 p-4">
      <h3 className="mb-2 text-sm font-semibold">
        {bankClassLabels[p.classification]} · {formatMoney(Math.abs(data.transaction.amountCents))}
      </h3>
      <ul className="space-y-1 text-sm text-slate-300">
        {details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </section>
  )
}
