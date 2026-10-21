import type { ForecastSources } from './forecasts'
import { paymentNetCents, sumCents } from './outflows'
import type { PlannerInput } from './planner'
export function plannerPaymentTotals(
  links: { kind: 'bill' | 'debt'; id: string }[],
  s: ForecastSources,
  today: string,
) {
  let paid = 0,
    pending = 0,
    scheduled = 0
  for (const link of links) {
    const p =
      link.kind === 'debt'
        ? s.payments.find((p) => p.id === link.id)
        : s.bills.flatMap((b) => b.payments).find((p) => p.id === link.id)
    if (!p) continue
    const status = 'paymentStatus' in p ? p.paymentStatus : p.status
    const amount = paymentNetCents(p, today)
    if (status === 'completed' && p.paymentDate <= today) paid = sumCents([paid, amount])
    else if (status === 'pending') pending = sumCents([pending, amount])
    else if (status === 'scheduled' || (status === 'completed' && p.paymentDate > today))
      scheduled = sumCents([scheduled, amount])
  }
  return { paidCents: paid, pendingCents: pending, scheduledCents: scheduled }
}
export function plannerInstallmentCents(i: {
  principalCents: number
  feesCents: number
  interestCents: number
}) {
  return sumCents([i.principalCents, i.feesCents, i.interestCents])
}
export function effectiveArrangement(v: PlannerInput, today: string) {
  return (
    v.kind === 'arrangement' &&
    ['accepted', 'active', 'completed'].includes(v.status) &&
    v.replacesOriginal &&
    v.verification.verified &&
    (!v.verification.validThrough || v.verification.validThrough >= today)
  )
}
export function activeAdvance(v: PlannerInput) {
  return (
    v.kind === 'advance' && ['active', 'completed'].includes(v.status) && v.verification.verified
  )
}

export function advancePaymentLinks(
  v: Extract<PlannerInput, { kind: 'advance' }>,
  s: ForecastSources,
) {
  return [
    ...new Map(
      [
        ...v.payments,
        ...s.payments
          .filter((p) => p.debtId === v.target.id && p.paymentDate >= v.receivedDate)
          .map((p) => ({ kind: 'debt' as const, id: p.id })),
      ].map((p) => [p.kind + ':' + p.id, p]),
    ).values(),
  ]
}
