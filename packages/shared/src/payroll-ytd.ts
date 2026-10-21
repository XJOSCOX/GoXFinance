import type { PayrollLine } from './payroll'
const namedCodes = new Set([
  'federal',
  'social_security',
  'medicare',
  'state',
  'local',
  'traditional',
  'roth',
])
export const payrollYtdLabels: Record<string, string> = {
  federal: 'Federal income tax',
  social_security: 'Social Security tax',
  medicare: 'Medicare tax',
  state: 'State income tax',
  local: 'Local income tax',
  traditional: 'Traditional retirement contributions',
  roth: 'Roth retirement contributions',
}
/** Reporting projection only: never changes a statement or its current-period amounts. */
export function payrollYtdLines(lines: PayrollLine[]) {
  const distinctFica = ['social_security', 'medicare'].every((code) =>
    lines.some((l) => l.code === code && l.ytdCents !== null),
  )
  return lines.flatMap((l) => {
    if (l.side === 'informational' && (!namedCodes.has(l.code) || l.ytdCents === null)) return []
    if (distinctFica && /^FICA TAX$/i.test(l.label.trim())) return []
    const side = l.side === 'informational' ? 'deduction' : l.side
    const canonical = ['federal', 'social_security', 'medicare'].includes(l.code)
    return [
      {
        ...l,
        side,
        label: canonical ? payrollYtdLabels[l.code] : l.label,
        component: canonical ? l.code : l.label.toLowerCase().trim(),
      },
    ]
  })
}
