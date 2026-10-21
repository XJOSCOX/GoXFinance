import type { IncomeTransaction } from './income'
import { roundCentsRatio } from './money-calculations'
import { sumCents } from './outflows'
/** Observations per source and recorded pay frequency, never a forecast of missing pay. */
export function incomePaycheckStatistics(transactions: IncomeTransaction[], today: string) {
  const groups = new Map<string, IncomeTransaction[]>()
  for (const t of transactions) {
    if (
      t.status !== 'confirmed' ||
      !t.depositDate ||
      t.depositDate > today ||
      t.actualNetCents === null
    )
      continue
    const key = `${t.sourceId}:${t.frequencySnapshot}`
    const rows = groups.get(key) ?? []
    rows.push(t)
    groups.set(key, rows)
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const sorted = [...rows].sort(
        (a, b) => b.depositDate!.localeCompare(a.depositDate!) || b.id.localeCompare(a.id),
      )
      return {
        key,
        sourceId: rows[0].sourceId,
        frequency: rows[0].frequencySnapshot,
        count: rows.length,
        latest: sorted[0],
        averageNetCents:
          rows.length >= 2
            ? roundCentsRatio(sumCents(rows.map((t) => t.actualNetCents!)), 1, rows.length)
            : null,
      }
    })
    .sort(
      (a, b) =>
        b.latest.depositDate!.localeCompare(a.latest.depositDate!) || a.key.localeCompare(b.key),
    )
}
