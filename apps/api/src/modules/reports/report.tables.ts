import type { ReportTable, ReportValue } from '@goxfinance/shared'
export function table(
  name: string,
  basis: string,
  rows: Record<string, ReportValue>[],
  fields?: string[],
): ReportTable {
  const keys = fields ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  return {
    name,
    basis,
    rows,
    columns: keys.map((key) => ({
      key,
      label: key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/Cents$/, '(cents)')
        .replace(/^./, (c) => c.toUpperCase()),
      unit: key.endsWith('Cents') ? 'cents' : 'text',
    })),
  }
}
export const inRange = (date: string | null | undefined, from: string, to: string) =>
  !!date && date.slice(0, 10) >= from && date.slice(0, 10) <= to
export function months(from: string, to: string) {
  const result: string[] = []
  let month = from.slice(0, 7)
  while (month <= to.slice(0, 7)) {
    result.push(month)
    const d = new Date(month + '-01T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() + 1)
    month = d.toISOString().slice(0, 7)
  }
  return result
}
