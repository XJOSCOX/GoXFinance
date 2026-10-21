import type { PayrollProfileInput, WeeklyHoursInput } from './payroll'
import { payrollRound } from './payroll-arithmetic'
// IRS Topic 751 and SSA contribution/benefit base. Only explicitly supported tax years are used.
export const payrollTaxSources = [
  'https://www.irs.gov/taxtopics/tc751',
  'https://www.ssa.gov/OACT/cola/cbb.html',
]
export function employeePayrollTax(
  rule: PayrollProfileInput['rules'][number],
  h: WeeklyHoursInput,
  base: number | null,
) {
  if (
    !['gross', 'explicit'].includes(rule.basis) ||
    rule.taxYear !== 2026 ||
    h.expectedPayDate?.slice(0, 4) !== String(rule.taxYear) ||
    rule.priorWagesForPayDate !== h.expectedPayDate ||
    rule.priorTaxableWagesCents === null ||
    base === null
  )
    return null
  const prior = rule.priorTaxableWagesCents
  if (rule.code === 'social_security')
    return payrollRound(BigInt(Math.min(base, Math.max(0, 18450000 - prior))) * 620n, 10000n)
  if (rule.code === 'medicare')
    return (
      payrollRound(BigInt(base) * 145n, 10000n) +
      payrollRound(BigInt(Math.min(base, Math.max(0, prior + base - 20000000))) * 90n, 10000n)
    )
  return null
}
