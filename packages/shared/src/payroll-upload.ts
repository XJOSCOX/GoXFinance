import { payrollSum } from './payroll-calculations'
import type { PayrollStatement, PayrollProfile, WeeklyHoursInput } from './payroll'
export function payrollStatementHours(s: PayrollStatement) {
  const earnings = s.lines.filter((l) => l.side === 'earnings')
  const sum = (lines: typeof earnings) =>
    lines.length && lines.every((l) => l.hoursHundredths !== null)
      ? payrollSum(lines.map((l) => l.hoursHundredths!))
      : null
  const byCode = (code: string) => sum(earnings.filter((l) => l.code === code))
  const rate = (code: string) => {
    const lines = earnings.filter((l) => l.code === code),
      values = new Set(lines.map((l) => l.rateCents))
    return lines.length && values.size === 1 ? lines[0].rateCents : null
  }
  return {
    regularHundredths: byCode('regular'),
    overtimeHundredths: byCode('overtime'),
    ptoHundredths: byCode('pto'),
    holidayHundredths: byCode('holiday'),
    otherPaidHundredths: sum(
      earnings.filter((l) => l.code === 'other_earning' && l.hoursHundredths !== null),
    ),
    regularRateCents: rate('regular'),
    overtimeRateCents: rate('overtime'),
    workedHundredths: sum(earnings.filter((l) => l.worked === true)),
    paidHundredths: sum(
      earnings.filter(
        (l) =>
          ['regular', 'overtime', 'pto', 'holiday'].includes(l.code) || l.hoursHundredths !== null,
      ),
    ),
  }
}
export function payrollImportedHours(
  s: PayrollStatement,
  sourceId: string,
  expectedPayDate: string,
): WeeklyHoursInput {
  const h = payrollStatementHours(s),
    amount = (code: string) =>
      payrollSum(
        s.lines
          .filter((l) => l.side === 'earnings' && l.code === code)
          .map((l) => l.currentCents ?? 0),
      )
  return {
    sourceId,
    documentOnly: true,
    workweekStart: s.periodStart!,
    workweekEnd: s.periodEnd!,
    expectedPayDate,
    regularHundredths: h.regularHundredths,
    overtimeHundredths: h.overtimeHundredths,
    ptoHundredths: h.ptoHundredths,
    holidayHundredths: h.holidayHundredths,
    otherPaidHundredths: h.otherPaidHundredths,
    regularRateCents: h.regularRateCents,
    overtimeRateCents: h.overtimeRateCents,
    unpaidHundredths: null,
    bonusCents: amount('bonus'),
    adjustmentCents: amount('adjustment'),
    otherEarningsCents: amount('other_earning'),
    notes: null,
  }
}
export type PayrollUploadSource = {
  id: string
  name: string
  profile: PayrollProfile | null
  existingWeek?: { id: string; stage: string }
}
export type PayrollUploadPreview = {
  statement: PayrollStatement
  warnings: string[]
  documentDigest: string
  receipt: string
  receivedAt: string
  sources: PayrollUploadSource[]
  matchedSourceId: string | null
}
