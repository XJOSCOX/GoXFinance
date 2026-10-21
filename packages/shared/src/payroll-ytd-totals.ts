import type { payrollTaxReport } from './payroll-reporting'
import { payrollSum } from './payroll-calculations'
import { payrollYtdLabels } from './payroll-ytd'
type Row = ReturnType<typeof payrollTaxReport>['latestYtd'][number]
/** Add latest employer observations, normalizing printed deduction signs, not cumulative paychecks. */
export function combinedPayrollYtd(rows: Row[]) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const category = ['federal', 'social_security', 'medicare', 'traditional', 'roth'].includes(
      row.code,
    )
    const key = [row.year, row.side, row.code, category ? '' : row.label.toLowerCase().trim()].join(
      '|',
    )
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((group) => {
    const first = group[0],
      known = group.filter((r) => r.normalizedCents !== null)
    return {
      ...first,
      label: ['federal', 'social_security', 'medicare', 'traditional', 'roth'].includes(first.code)
        ? payrollYtdLabels[first.code]
        : first.label,
      amountCents: known.length ? payrollSum(known.map((r) => r.normalizedCents!)) : null,
      payDate: group
        .map((r) => r.payDate)
        .sort()
        .at(-1)!,
      employerCount: new Set(group.map((r) => r.sourceId)).size,
      missingCount: group.filter((r) => r.amountCents === null).length,
    }
  })
}
