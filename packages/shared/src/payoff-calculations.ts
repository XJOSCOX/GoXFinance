import type { Debt } from './debts'
import type { PayoffScenarioInput } from './debt-planning'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { sumCents } from './outflows'
const safe = (v: bigint) => {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Projection exceeds supported range')
  return Number(v)
}
export function payoffInputs(debts: Debt[], input: PayoffScenarioInput) {
  return debtObligationGroups(debts)
    .map((group) => {
      const d = representativeDebtBalance(group),
        a = input.assumptions.find((a) => a.debtId === d.id)
      return {
        id: d.id,
        name: d.accountNickname || d.creditorName,
        balanceCents: a?.balanceCents ?? d.currentBalanceCents,
        minimumCents:
          a?.minimumCents ??
          (group.some((d) => d.minimumPaymentCents !== null)
            ? Math.max(...group.map((d) => d.minimumPaymentCents ?? 0))
            : null),
        apr: a?.apr ?? d.interestRateApr,
        assumed: !!a,
        status: d.paymentStatus,
      }
    })
    .filter((d) => d.balanceCents !== 0)
}
/** Interest rounded half-up to cents monthly, then minimums, then extra. No daily accrual or fees. */
export function simulatePayoff(debts: Debt[], input: PayoffScenarioInput) {
  const all = payoffInputs(debts, input),
    missing = all.filter(
      (d) => d.balanceCents === null || d.minimumCents === null || d.apr === null,
    )
  const eligible = all
    .filter((d) => !missing.includes(d))
    .map((d) => ({
      ...d,
      balance: d.balanceCents!,
      interest: 0,
      payoffMonth: null as number | null,
    }))
  const minimumCents = sumCents(all.map((d) => d.minimumCents ?? 0)),
    initialCents = sumCents(eligible.map((d) => d.balance))
  const order = [...eligible].sort((a, b) =>
    input.strategy === 'avalanche'
      ? Number(b.apr) - Number(a.apr) || a.balance - b.balance || a.id.localeCompare(b.id)
      : input.strategy === 'custom'
        ? (input.order.includes(a.id) ? input.order.indexOf(a.id) : 9999) -
            (input.order.includes(b.id) ? input.order.indexOf(b.id) : 9999) ||
          a.id.localeCompare(b.id)
        : a.balance - b.balance || a.id.localeCompare(b.id),
  )
  const budget = sumCents([
      sumCents(eligible.map((d) => d.minimumCents!)),
      input.strategy === 'minimums' ? 0 : input.extraCents,
    ]),
    timeline: {
      month: number
      date: string
      remainingCents: number
      interestCents: number
      paidCents: number
    }[] = []
  let month = 0,
    totalInterest = 0
  for (; month < 1200 && eligible.some((d) => d.balance > 0);) {
    month++
    let interestCents = 0,
      paidCents = 0
    for (const d of eligible.filter((d) => d.balance > 0)) {
      const [whole, fraction = ''] = d.apr!.split('.'),
        rate = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
      const interest = safe((BigInt(d.balance) * rate + 6000000n) / 12000000n)
      d.balance = sumCents([d.balance, interest])
      d.interest = sumCents([d.interest, interest])
      interestCents = sumCents([interestCents, interest])
      const paid = Math.min(d.minimumCents!, d.balance)
      d.balance -= paid
      paidCents = sumCents([paidCents, paid])
    }
    let extra = input.strategy === 'minimums' ? 0 : budget - paidCents
    for (const d of order) {
      const paid = Math.min(d.balance, extra)
      d.balance -= paid
      extra -= paid
      paidCents = sumCents([paidCents, paid])
    }
    for (const d of eligible) if (!d.balance && !d.payoffMonth) d.payoffMonth = month
    totalInterest = sumCents([totalInterest, interestCents])
    const anchor = new Date(input.startDate + 'T00:00:00Z'),
      date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + month, 1))
        .toISOString()
        .slice(0, 10)
    timeline.push({
      month,
      date,
      remainingCents: sumCents(eligible.map((d) => d.balance)),
      paidCents,
      interestCents,
    })
    if (paidCents === 0 && interestCents === 0) break
  }
  const complete = missing.length === 0 && eligible.every((d) => d.balance === 0)
  return {
    complete,
    missing,
    initialCents,
    minimumCents,
    monthlyCents: sumCents([minimumCents, input.strategy === 'minimums' ? 0 : input.extraCents]),
    interestCents: totalInterest,
    months: complete ? month : null,
    payoffDate: complete ? (timeline.at(-1)?.date ?? input.startDate) : null,
    order: order.map((d) => ({
      id: d.id,
      name: d.name,
      interestCents: d.interest,
      payoffMonth: d.payoffMonth,
    })),
    timeline,
    shortfallCents:
      input.availableCents === null
        ? null
        : Math.max(
            0,
            minimumCents +
              (input.strategy === 'minimums' ? 0 : input.extraCents) -
              input.availableCents,
          ),
  }
}
