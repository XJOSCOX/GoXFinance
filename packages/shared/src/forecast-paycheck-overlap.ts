import type { IncomeSource } from './income'

// Dates alone cannot prove identity. Exact source dates cover ordinary fallback
// replacement; a nearby date only establishes ambiguity, never a new deposit.
export function paycheckAssumptionOverlap(
  frequency: IncomeSource['frequency'],
  dates: Iterable<string>,
  date: string,
): 'exact' | 'ambiguous' | null {
  const known = [...dates]
  if (known.includes(date)) return 'exact'
  const cadence = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : null
  return cadence &&
    known.some((d) => Math.abs(Date.parse(d) - Date.parse(date)) / 86400000 < cadence / 2)
    ? 'ambiguous'
    : null
}
