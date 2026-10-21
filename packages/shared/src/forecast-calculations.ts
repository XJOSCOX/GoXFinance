import { plannerCashFlow } from './planner-cash-flow'
import { addDebtPlanGoals } from './debt-payment-plans'
import { smartForecastInflows } from './smart-forecast-inflows'
import { prepareSmartEvent, traceForecastEvent } from './smart-forecast-events'
import { enrichSmartForecast } from './smart-forecast-report'
import { forecastInflows } from './forecast-inflows'
import { forecastObligations } from './forecast-obligations'
import { cashOutflows, sumCents } from './outflows'
import type { ForecastInput, ForecastSources, ForecastEvent, ForecastReport } from './forecasts'
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export function forecast(s: ForecastSources, v: ForecastInput, today: string): ForecastReport {
  const planning = v.smart && s.planner ? plannerCashFlow(s, v, today) : null
  if (planning) s = planning.sources
  const events: ForecastEvent[] = [],
    warnings: string[] = planning?.warnings ?? [],
    seen = new Set<string>(),
    inside = (d: string) => d >= v.startDate && d <= v.endDate
  const add = (raw: ForecastEvent) => {
    const traced = v.smart ? traceForecastEvent(raw, s) : raw
    const adjusted = planning ? planning.adjust(traced) : traced
    const e = adjusted && v.smart ? prepareSmartEvent(adjusted, v, warnings) : adjusted
    if (!e) return
    if (inside(e.date) && !seen.has(e.id)) {
      seen.add(e.id)
      events.push(e)
      if (e.amountCents === null) warnings.push(`Unknown amount: ${e.name} (${e.date})`)
    }
  }
  for (const event of planning?.events ?? []) add(event)
  const months = [
    ...new Set(
      Array.from(
        { length: Math.round((Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000) + 1 },
        (_, i) => addDays(v.startDate, i).slice(0, 7),
      ),
    ),
  ]
  for (const t of cashOutflows(
    s.expenses,
    s.bills.flatMap((b) => b.payments),
    s.payments,
    today,
    s.refunds,
  ))
    if (t.cashOutflowCents !== 0 || t.spendingCents !== 0)
      add({
        id: 'actual:' + t.id,
        date: t.date,
        name:
          t.source === 'refund'
            ? 'Confirmed refund credit'
            : t.source === 'expense'
              ? (s.expenses.find((e) => e.id === t.id)?.description ?? 'Purchase')
              : t.source === 'debt'
                ? 'Completed debt payment'
                : 'Completed bill payment',
        amountCents: Math.abs(t.cashOutflowCents),
        spendingCents: t.spendingCents,
        direction: t.source === 'refund' ? 'in' : 'out',
        kind:
          t.source === 'refund'
            ? 'refund'
            : t.source === 'expense'
              ? 'purchase'
              : t.source === 'debt'
                ? 'debt_repayment'
                : 'bill',
        estimated: false,
      })
  if (v.smart) {
    if (!v.smart.opening)
      warnings.push('Opening cash balance required for a complete cash projection.')
    if (s.privacyLimited)
      warnings.push(
        'This projection covers only financial sources you are permitted to view. Household totals may be incomplete.',
      )
    smartForecastInflows(s, v, today, add, warnings)
  } else forecastInflows(s, v, today, add, warnings)
  for (const e of s.expenses.filter((e) => !e.voided && e.transactionDate > today))
    add({
      id: 'future-expense:' + e.id,
      date: e.transactionDate,
      name: e.description,
      amountCents: e.paymentMethod === 'credit_card' ? 0 : e.amountCents,
      spendingCents: e.amountCents,
      direction: 'out',
      kind: 'purchase',
      estimated: true,
    })
  forecastObligations(s, v, today, months, add, warnings)
  if (v.smart && s.planner) addDebtPlanGoals(s, v, today, events, warnings, add)
  if (v.variableSpendingCents) {
    const count = Math.round((Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000) + 1,
      base = Math.floor(v.variableSpendingCents / count),
      remainder = v.variableSpendingCents % count
    for (let i = 0; i < count; i++)
      add({
        id: 'variable-spending:' + i,
        date: addDays(v.startDate, i),
        name: 'Additional daily spending allowance',
        amountCents: base + (i < remainder ? 1 : 0),
        spendingCents: base + (i < remainder ? 1 : 0),
        direction: 'out',
        kind: 'scenario',
        estimated: true,
      })
  }
  if (v.extraDebtCents)
    add({
      id: 'extra-debt',
      date: v.endDate,
      name: 'Additional debt payment (range total)',
      amountCents: v.extraDebtCents,
      direction: 'out',
      kind: 'debt_repayment',
      estimated: true,
    })
  for (const item of v.oneTime)
    if (item.kind !== 'uncertain_payout' || v.includeUncertainPayouts)
      add({
        id: 'scenario:' + item.id,
        date: item.date,
        name: item.name,
        amountCents: item.amountCents,
        spendingCents: item.kind === 'expense' ? item.amountCents : 0,
        direction: item.kind === 'expense' ? 'out' : 'in',
        kind: item.kind === 'uncertain_payout' ? 'uncertain_payout' : 'scenario',
        estimated: true,
      })
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.direction.localeCompare(b.direction) ||
      a.id.localeCompare(b.id),
  )
  const incomplete = events.some((e) => e.amountCents === null) || warnings.length > 0,
    days: ForecastReport['days'] = [],
    shortfalls: ForecastReport['shortfalls'] = []
  let change = 0
  for (let date = v.startDate; date <= v.endDate; date = addDays(date, 1)) {
    const on = events.filter((e) => e.date === date)
    change = sumCents([
      change,
      ...on.map((e) => (e.direction === 'in' ? 1 : -1) * (e.amountCents ?? 0)),
    ])
    const starting = v.smart ? (v.smart.opening?.amountCents ?? null) : v.startingCents
    const subtotal = starting === null ? null : sumCents([starting, change]),
      cash = incomplete ? null : subtotal
    days.push({ date, netChangeCents: change, cashCents: cash, knownSubtotalCents: subtotal })
    if (subtotal !== null && subtotal < 0)
      shortfalls.push({
        date,
        amountCents: -subtotal,
        payments: on.filter((e) => e.direction === 'out').map((e) => e.name),
      })
  }
  const incomeCents = sumCents(
      events
        .filter((e) => e.direction === 'in' && !['refund', 'advance_receipt'].includes(e.kind))
        .map((e) => e.amountCents ?? 0),
    ),
    outflowCents = sumCents(
      events
        .filter((e) => e.direction === 'out' || e.kind === 'refund')
        .map((e) => (e.kind === 'refund' ? -1 : 1) * (e.amountCents ?? 0)),
    )
  const borrowedCents = sumCents(
    events.filter((e) => e.kind === 'advance_receipt').map((e) => e.amountCents ?? 0),
  )
  const result: ForecastReport = {
    ...(s.planner ? { borrowedCents } : {}),
    spendingCents: sumCents(events.map((e) => e.spendingCents ?? 0)),
    events,
    warnings: [...new Set(warnings)],
    days,
    incomeCents,
    outflowCents,
    netChangeCents: sumCents([incomeCents, borrowedCents, -outflowCents]),
    endingCents: days.at(-1)?.cashCents ?? null,
    lowestCents:
      incomplete || (v.smart ? !v.smart.opening : v.startingCents === null)
        ? null
        : Math.min(
            v.smart ? v.smart.opening!.amountCents : v.startingCents!,
            ...days.map((d) => d.cashCents!),
          ),
    shortfalls,
    incomplete,
  }
  return v.smart ? enrichSmartForecast(result, v) : result
}
