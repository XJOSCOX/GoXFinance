import { sumCents } from './outflows'
export function roundedRatio(
  numerator: number,
  denominator: number,
  multiplier = 1,
): number | null {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    !Number.isSafeInteger(multiplier)
  )
    return null
  const n = BigInt(numerator) * BigInt(multiplier),
    d = BigInt(denominator),
    sign = n < 0n ? -1n : 1n
  const result = sign * ((sign * n + d / 2n) / d)
  return result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(result)
}
export function median(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b),
    i = Math.floor(v.length / 2)
  return v.length % 2 ? v[i] : roundedRatio(sumCents([v[i - 1], v[i]]), 2)
}
export const dayOffset = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
export function insightPeriods(today: string) {
  const from = today.slice(0, 7) + '-01',
    previousEnd = dayOffset(from, -1),
    comparisonFrom = previousEnd.slice(0, 7) + '-01'
  const day = Math.min(Number(today.slice(-2)), Number(previousEnd.slice(-2)))
  // Equal day-of-month coverage on both sides, even across shorter months.
  return {
    from,
    through: from.slice(0, 8) + String(day).padStart(2, '0'),
    comparisonFrom,
    comparisonThrough: comparisonFrom.slice(0, 8) + String(day).padStart(2, '0'),
  }
}
export const normalizeMerchant = (v: string) =>
  v
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
