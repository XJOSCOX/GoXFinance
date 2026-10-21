import {
  payrollPeriodCandidates,
  payrollPeriodIssue,
  type PayrollFrequency,
  type PayrollStatement,
  type PayrollUploadSource,
} from '@goxfinance/shared'
export function suggestPayrollFrequency(
  s: PayrollStatement,
  source?: PayrollUploadSource,
): PayrollFrequency | '' {
  if (source?.existingWeek?.payFrequency) return source.existingWeek.payFrequency
  const candidates = payrollPeriodCandidates(s.periodStart, s.periodEnd),
    known = source?.profile?.payFrequency ?? source?.frequency
  if (
    s.periodStart &&
    s.periodEnd &&
    known &&
    !payrollPeriodIssue(
      s.periodStart,
      s.periodEnd,
      known,
      source?.profile?.semiMonthlySplitDay ?? 15,
      source?.profile?.periodAnchor,
    )
  )
    return known
  if (s.payFrequency && candidates.includes(s.payFrequency)) return s.payFrequency
  if (known && candidates.includes(known)) return known
  return candidates.length === 1 && candidates[0] !== 'irregular' ? candidates[0] : ''
}
