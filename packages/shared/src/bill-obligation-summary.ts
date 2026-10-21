import type { BillView, BillPeriodView } from './bills'
import type { PlannerData } from './planner'
import {
  billBudgetEstimate,
  billMonthlyCents,
  billScheduleDates,
  calculateBillSummary,
} from './bill-calculations'
import { sumCents } from './outflows'
import { smartPlanner } from './planner-engine'
import { smartForecastInput } from './smart-forecast'
import { plannerEventTarget } from './planner-priorities'
import { debtPlanProblem, debtPlanIds } from './debt-payment-plans'
// Read-only projection: never writes future billed amounts or changes historical periods.
export function billNextMonthProjection(b: BillView, today: string) {
  const month = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 7)
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10)
  const prior = b.periods.filter((p) => p.dueDate < month + '-01')
  const next = b.periods.filter((p) => p.dueDate.startsWith(month))
  const sum = (ps: BillPeriodView[]) =>
    ps.reduce(
      (total, p) => {
        const r = billPeriodPlannedRemaining(b, p, today)
        return {
          amountCents: sumCents([total.amountCents, r.amountCents ?? 0]),
          unknownCount: total.unknownCount + (r.amountCents === null ? 1 : 0),
          estimated: total.estimated || r.estimated,
        }
      },
      { amountCents: 0, unknownCount: 0, estimated: false },
    )
  const due = sum(next),
    carried = sum(prior)
  if (b.kind === 'recurring' && b.status === 'active') {
    const amount = b.amountType === 'fixed' ? b.amountCents : b.estimatedAmountCents
    for (const date of billScheduleDates(b, end).filter((date) => date.startsWith(month))) {
      if (next.some((p) => p.dueDate === date)) continue
      due.amountCents = sumCents([due.amountCents, amount ?? 0])
      due.unknownCount += amount === null ? 1 : 0
      due.estimated ||= b.amountType === 'variable'
    }
  }
  return {
    month,
    due,
    carried,
    totalCents: sumCents([due.amountCents, carried.amountCents]),
    unknownCount: due.unknownCount + carried.unknownCount,
  }
}
// Register columns use one explicit due month; overdue periods remain a separate total.
export function billRegisterAmounts(b: BillView, today: string) {
  const current = b.periods.filter(
    (p) => p.dueDate.startsWith(today.slice(0, 7)) && p.paymentStatus !== 'cancelled',
  )
  const known = current.filter((p) => p.amountCents !== null)
  const carry = billCarryForward(b, today)
  return {
    monthlyCents:
      b.kind === 'recurring'
        ? billMonthlyCents(
            b.amountType === 'fixed' ? b.amountCents : b.estimatedAmountCents,
            b.frequency,
          )
        : b.amountType === 'fixed'
          ? b.amountCents
          : b.estimatedAmountCents,
    currentCount: current.length,
    unknownCurrentCount: current.length - known.length,
    confirmedCents: known.length ? sumCents(known.map((p) => p.amountCents!)) : null,
    paidCents: sumCents(current.map((p) => p.paidCents)),
    remainingCents: known.length ? sumCents(known.map((p) => p.remainingCents ?? 0)) : null,
    pastDue: carry.past,
    nextMonth: billNextMonthProjection(b, today),
  }
}
export function billPeriodPlannedRemaining(b: BillView, p: BillPeriodView, today: string) {
  if (['paid', 'credited', 'overpaid', 'cancelled'].includes(p.paymentStatus))
    return { amountCents: 0, estimated: false }
  const estimate = billBudgetEstimate(b, p, today)
  const amount = p.amountCents ?? estimate
  return {
    amountCents: amount === null ? null : Math.max(0, amount - p.paidCents - p.creditCents),
    estimated: p.amountCents === null,
  }
}
export function billCarryForward(b: BillView, today: string) {
  const periods = [...b.periods]
    .filter((p) => !['paid', 'credited', 'overpaid', 'cancelled'].includes(p.paymentStatus))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const next = periods.find((p) => p.dueDate >= today),
    past = periods.filter((p) => p.dueDate < today)
  const totals = (ps: BillPeriodView[]) =>
    ps.reduce(
      (a, p) => {
        const r = billPeriodPlannedRemaining(b, p, today)
        return {
          amountCents: sumCents([a.amountCents, r.amountCents ?? 0]),
          estimated: a.estimated || r.estimated,
          unknownCount: a.unknownCount + (r.amountCents === null ? 1 : 0),
        }
      },
      { amountCents: 0, estimated: false, unknownCount: 0 },
    )
  return {
    nextDate: next?.dueDate ?? null,
    past: totals(past),
    nextPayment: totals([...past, ...(next ? [next] : [])]),
  }
}
export function billPlanningTotals(data: PlannerData, today: string) {
  const s = data.sources,
    monthly = calculateBillSummary(
      s.bills,
      s.debts.map((d) => ({ ...d, minimumPaymentCents: null })),
      today,
    ).householdMonthlyObligationsCents
  const base = smartForecastInput(data.settings, today, 30),
    items = smartPlanner(s, base, today).forecast.events.filter(
      (e) => e.estimated && e.direction === 'out' && e.date.startsWith(today.slice(0, 7)),
    )
  const replaced = new Set<string>()
  for (const r of s.planner?.records ?? []) {
    const p = r.values
    if (
      p.kind === 'debt_plan' &&
      p.mode === 'pay_by_date' &&
      p.replaceOriginal &&
      !debtPlanProblem(p, s, today) &&
      p.startDate <= today &&
      p.deadline >= today &&
      p.deadline.startsWith(today.slice(0, 7))
    )
      for (const id of debtPlanIds(p, s)) replaced.add(id)
  }
  const retained = s.bills.filter((b) => !b.linkedDebtId || !replaced.has(b.linkedDebtId)),
    baseWithPlans = calculateBillSummary(
      retained,
      s.debts.map((d) => ({ ...d, minimumPaymentCents: null })),
      today,
    ).householdMonthlyObligationsCents
  const extra = items.filter((e) => {
    const t = plannerEventTarget(e, s)
    return (
      t?.kind === 'debt' &&
      (e.id.startsWith('debt-goal:') ||
        !retained.some((b) => b.status === 'active' && b.linkedDebtId === t.id))
    )
  })
  let confirmedRemainingCents = 0,
    estimatedRemainingCents = 0,
    unknownCount = 0
  for (const b of s.bills.filter((b) => b.status !== 'cancelled'))
    for (const p of b.periods.filter((p) => p.dueDate.startsWith(today.slice(0, 7)))) {
      const r = billPeriodPlannedRemaining(b, p, today)
      if (r.amountCents === null) unknownCount++
      else if (r.estimated)
        estimatedRemainingCents = sumCents([estimatedRemainingCents, r.amountCents])
      else confirmedRemainingCents = sumCents([confirmedRemainingCents, r.amountCents])
    }
  const upcoming = s.bills
    .filter((b) => b.status !== 'cancelled')
    .map((b) => billNextMonthProjection(b, today))
  return {
    monthlyBillsCents: monthly,
    billsAndConfirmedPlansCents: sumCents([baseWithPlans, ...extra.map((e) => e.amountCents ?? 0)]),
    confirmedRemainingCents,
    estimatedRemainingCents,
    unknownCount,
    nextMonthBillsCents: sumCents(upcoming.map((p) => p.due.amountCents)),
    nextMonthUnknownCount: upcoming.reduce((count, p) => count + p.due.unknownCount, 0),
    nextMonth: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1))
      .toISOString()
      .slice(0, 7),
  }
}
