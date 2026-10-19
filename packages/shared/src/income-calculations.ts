import type { IncomeSource, IncomeTransaction } from './income'
import { sumCents } from './outflows'

const units = (value: string, decimals: number) => {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'))
}
export function estimatedHourlyGross(
  rateCents: number | null,
  regular: string | null,
  overtime: string | null,
  multiplier: string,
): number | null {
  if (rateCents === null || regular === null) return null
  if (
    !Number.isSafeInteger(rateCents) ||
    rateCents < 0 ||
    !/^\d{1,4}(\.\d{1,2})?$/.test(regular) ||
    (overtime !== null && !/^\d{1,4}(\.\d{1,2})?$/.test(overtime)) ||
    !/^\d{1,2}(\.\d{1,3})?$/.test(multiplier)
  )
    throw new Error('Invalid hourly calculation')
  const numerator =
    BigInt(rateCents) *
    (units(regular, 2) * 1000n + units(overtime ?? '0', 2) * units(multiplier, 3))
  const result = Number((numerator + 50000n) / 100000n)
  if (!Number.isSafeInteger(result)) throw new Error('Gross estimate exceeds supported range')
  return result
}
export function upcomingPayday(source: Pick<IncomeSource, 'frequency' | 'payday'>, today: string) {
  if (source.frequency !== 'weekly' || source.payday === null) return null
  const date = new Date(today + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + ((source.payday - date.getUTCDay() + 7) % 7))
  return date.toISOString().slice(0, 10)
}
const weekKey = (date: string) => {
  const day = new Date(date + 'T00:00:00Z')
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}
// Include zero-income weeks/months between first and last confirmed deposits through today.
export function incomeSummary(transactions: IncomeTransaction[], month: string, today: string) {
  const confirmed = transactions.filter(
    (v) => v.status === 'confirmed' && v.depositDate && v.depositDate <= today,
  )
  const monthly = confirmed.filter((v) => v.depositDate!.startsWith(month))
  const total = (items: IncomeTransaction[], field: 'actualNetCents' | 'expectedNetCents') =>
    sumCents(items.map((v) => v[field] ?? 0))
  const periods = (key: (date: string) => string) => {
    const grouped = new Map<string, number>()
    for (const item of confirmed) {
      const id = key(item.depositDate!)
      grouped.set(id, sumCents([grouped.get(id) ?? 0, item.actualNetCents!]))
    }
    return [...grouped]
      .map(([period, amountCents]) => ({ period, amountCents }))
      .sort((a, b) => b.period.localeCompare(a.period))
  }
  const first = confirmed.map((v) => v.depositDate!).sort()[0]
  const weeks = first
    ? Math.round((Date.parse(weekKey(today)) - Date.parse(weekKey(first))) / 604800000) + 1
    : 0
  const months = first
    ? (Number(today.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
      Number(today.slice(5, 7)) -
      Number(first.slice(5, 7)) +
      1
    : 0
  const net = total(confirmed, 'actualNetCents')
  return {
    confirmedCents: total(monthly, 'actualNetCents'),
    pendingCents: total(
      transactions.filter((v) => v.status === 'pending' && v.payDate.startsWith(month)),
      'expectedNetCents',
    ),
    expectedCents: total(
      transactions.filter((v) => v.status === 'expected' && v.payDate >= today),
      'expectedNetCents',
    ),
    pendingUnknownCount: transactions.filter(
      (v) => v.status === 'pending' && v.payDate.startsWith(month) && v.expectedNetCents === null,
    ).length,
    expectedUnknownCount: transactions.filter(
      (v) => v.status === 'expected' && v.payDate >= today && v.expectedNetCents === null,
    ).length,
    weekly: periods(weekKey),
    monthly: periods((date) => date.slice(0, 7)),
    averageWeeklyCents: weeks ? Math.round(net / weeks) : null,
    averageMonthlyCents: months ? Math.round(net / months) : null,
    weekCount: weeks,
    monthCount: months,
    byMember: [...new Set(monthly.map((v) => v.responsibleMemberId))].map((id) => ({
      id,
      amountCents: total(
        monthly.filter((v) => v.responsibleMemberId === id),
        'actualNetCents',
      ),
    })),
    bySource: [...new Set(monthly.map((v) => v.sourceId))].map((id) => ({
      id,
      amountCents: total(
        monthly.filter((v) => v.sourceId === id),
        'actualNetCents',
      ),
    })),
  }
}
