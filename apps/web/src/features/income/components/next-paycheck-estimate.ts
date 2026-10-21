import type { IncomeSource, IncomeTransaction, PayrollWeek } from '@goxfinance/shared'
export function latestPaycheckForecast(w: PayrollWeek) {
  return [...w.forecasts].sort(
    (a, b) => b.modelVersion - a.modelVersion || b.createdAt.localeCompare(a.createdAt),
  )[0]?.result
}
export function nextPaycheckEstimate(
  weeks: PayrollWeek[],
  sources: IncomeSource[],
  transactions: IncomeTransaction[],
  today: string,
) {
  const active = new Set(
    sources.filter((s) => !s.isArchived && s.status === 'active').map((s) => s.id),
  )
  return weeks
    .filter(
      (w) =>
        active.has(w.sourceId) &&
        ['hours_draft', 'hours_submitted', 'payroll_pending'].includes(w.stage) &&
        !w.statementReceivedAt &&
        !w.statement &&
        w.expectedPayDate &&
        w.expectedPayDate >= today &&
        w.forecasts.length &&
        !transactions.some(
          (t) => t.id === w.incomeTransactionId && ['confirmed', 'cancelled'].includes(t.status),
        ),
    )
    .sort(
      (a, b) =>
        a.expectedPayDate!.localeCompare(b.expectedPayDate!) ||
        a.workweekEnd.localeCompare(b.workweekEnd) ||
        a.id.localeCompare(b.id),
    )[0]
}
export function estimatedWorkedTime(w: PayrollWeek) {
  const regular = w.regularMinutes ?? (w.regularHundredths === 0 ? 0 : undefined),
    overtime = w.overtimeMinutes ?? (w.overtimeHundredths === 0 ? 0 : undefined)
  if (regular !== undefined && overtime !== undefined) {
    const minutes = regular + overtime
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
  }
  return `${(latestPaycheckForecast(w)!.workedHundredths / 100).toFixed(2)} h`
}
