import { estimatedHourlyGross } from './income-calculations'
import type { ForecastSources, ForecastInput, ForecastEvent } from './forecasts'
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export function forecastInflows(
  s: ForecastSources,
  v: ForecastInput,
  today: string,
  add: (e: ForecastEvent) => void,
  warnings: string[],
) {
  for (const t of s.income.transactions)
    if (t.status === 'confirmed' && t.depositDate && t.depositDate <= today)
      add({
        id: 'income:' + t.id,
        date: t.depositDate,
        name: s.income.sources.find((src) => src.id === t.sourceId)?.name ?? 'Confirmed deposit',
        amountCents: t.actualNetCents,
        direction: 'in',
        kind: 'confirmed_income',
        estimated: false,
        grossCents: t.actualGrossCents,
      })
  for (const source of s.income.sources.filter(
    (src) => src.status === 'active' && !src.isArchived && src.incomeType !== 'trading_payout',
  )) {
    const a = v.income.find((a) => a.sourceId === source.id)
    if (!a) {
      warnings.push(`No paycheck-date/net assumptions for ${source.name}`)
      continue
    }
    const net =
      v.mode === 'conservative'
        ? a.conservativeNetCents
        : v.mode === 'optimistic'
          ? a.optimisticNetCents
          : a.expectedNetCents
    const gross =
      source.incomeType === 'hourly'
        ? estimatedHourlyGross(
            source.hourlyRateCents,
            a.regularHours,
            a.overtimeHours,
            source.overtimeMultiplier,
          )
        : source.expectedGrossCents
    for (let date = v.startDate; date <= v.endDate; date = addDays(date, 1)) {
      if (date < today || date < a.firstPayDate) continue
      const d = new Date(date + 'T00:00:00Z'),
        anchor = new Date(a.firstPayDate + 'T00:00:00Z'),
        delta = (Date.parse(date) - Date.parse(a.firstPayDate)) / 86400000
      const due =
        source.frequency === 'weekly'
          ? delta % 7 === 0
          : source.frequency === 'biweekly'
            ? delta % 14 === 0
            : source.frequency === 'monthly'
              ? d.getUTCDate() ===
                Math.min(
                  anchor.getUTCDate(),
                  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
                )
              : source.frequency === 'annually'
                ? d.getUTCMonth() === anchor.getUTCMonth() && d.getUTCDate() === anchor.getUTCDate()
                : date === a.firstPayDate
      if (!due) continue
      if (source.frequency === 'semimonthly')
        warnings.push(
          `${source.name}: only explicit first payday included; add the second payday as a scenario income item`,
        )
      const recorded = s.income.transactions.find(
        (t) => t.sourceId === source.id && t.payDate === date && t.status !== 'cancelled',
      )
      if (recorded?.status === 'confirmed' && recorded.depositDate && recorded.depositDate <= today)
        continue
      add({
        id: 'forecast-income:' + source.id + ':' + date,
        date,
        name: source.name,
        amountCents: recorded?.expectedNetCents ?? net,
        direction: 'in',
        kind: 'expected_income',
        estimated: true,
        grossCents: gross,
      })
    }
  }
}
