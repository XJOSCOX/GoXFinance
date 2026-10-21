import { sumCents, type IncomeTransaction } from '@goxfinance/shared'
export function paycheckOverview(transactions: IncomeTransaction[], month: string, today: string) {
  const received = transactions.filter(
    (t) => t.status === 'confirmed' && t.depositDate?.startsWith(month) && t.depositDate <= today,
  )
  const known = (field: 'actualGrossCents' | 'deductionsCents') => {
    const values = received.map((t) => t[field]).filter((v): v is number => typeof v === 'number')
    return {
      cents: values.length ? sumCents(values) : null,
      missing: received.length - values.length,
    }
  }
  const documented = transactions.filter(
    (t) =>
      t.status !== 'cancelled' &&
      (typeof t.actualGrossCents === 'number' || typeof t.actualNetCents === 'number'),
  )
  const latest = [...documented].sort(
    (a, b) => b.payDate.localeCompare(a.payDate) || b.id.localeCompare(a.id),
  )[0]
  return {
    gross: known('actualGrossCents'),
    deductions: known('deductionsCents'),
    receivedCount: received.length,
    latest,
  }
}
