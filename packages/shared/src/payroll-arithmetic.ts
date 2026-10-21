import type { PayrollStatement, WeeklyHoursInput } from './payroll'
export function payrollRound(n: bigint, d: bigint) {
  const result = n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(-Number.MAX_SAFE_INTEGER))
    throw new Error('Payroll amount exceeds the supported range')
  return Number(result)
}
export function payrollSum(values: number[]) {
  return payrollRound(
    values.reduce((n, v) => n + BigInt(v), 0n),
    1n,
  )
}
export function payrollGross(h: WeeklyHoursInput) {
  const required = (v: number | null) => {
    if (v === null) throw new Error('A documented-only paycheck has no prior hours forecast')
    return v
  }
  const pay = (hundredths: number | null, minutes: number | undefined, rate: number | null) =>
    payrollRound(
      BigInt(minutes ?? required(hundredths)) * BigInt(required(rate)),
      minutes === undefined ? 100n : 60n,
    )
  const regular = pay(h.regularHundredths, h.regularMinutes, h.regularRateCents),
    overtime = pay(h.overtimeHundredths, h.overtimeMinutes, h.overtimeRateCents),
    pto = pay(h.ptoHundredths, h.ptoMinutes, h.regularRateCents),
    holiday = pay(h.holidayHundredths, h.holidayMinutes, h.regularRateCents),
    other = pay(h.otherPaidHundredths, h.otherPaidMinutes, h.regularRateCents)
  const earnings = [
    { code: 'regular', amountCents: regular },
    { code: 'overtime', amountCents: overtime },
    { code: 'pto', amountCents: pto },
    { code: 'holiday', amountCents: holiday },
    { code: 'other_paid', amountCents: other },
    { code: 'bonus', amountCents: h.bonusCents },
    { code: 'adjustment', amountCents: h.adjustmentCents },
    { code: 'other_earning', amountCents: h.otherEarningsCents },
  ]
  const grossCents = payrollSum(earnings.map((e) => e.amountCents))
  if (grossCents < 0) throw new Error('Estimated gross cannot be negative')
  return {
    grossCents,
    earnings,
    workedHundredths: required(h.regularHundredths) + required(h.overtimeHundredths),
    paidHundredths:
      required(h.regularHundredths) +
      required(h.overtimeHundredths) +
      required(h.ptoHundredths) +
      required(h.holidayHundredths) +
      required(h.otherPaidHundredths),
  }
}
export function payrollReconciliation(s: PayrollStatement) {
  const issues: string[] = [],
    earn = s.lines.filter((l) => l.side === 'earnings'),
    ded = s.lines.filter((l) => l.side === 'deduction')
  if ([s.grossCents, s.deductionsCents, s.netCents].some((v) => v === null))
    issues.push('Gross, total employee deductions and net must all be confirmed.')
  if (
    s.grossCents !== null &&
    s.deductionsCents !== null &&
    s.netCents !== null &&
    BigInt(s.grossCents) - BigInt(s.deductionsCents) !== BigInt(s.netCents)
  )
    issues.push('Statement gross minus employee deductions does not equal net.')
  for (const [name, lines, total] of [
    ['earnings', earn, s.grossCents],
    ['deductions', ded, s.deductionsCents],
  ] as const) {
    if (!lines.length || lines.some((l) => l.currentCents === null))
      issues.push(`Missing current-period ${name} components; unknown is not zero.`)
    else if (
      total !== null &&
      BigInt(payrollSum(lines.map((l) => l.currentCents!))) *
        (name === 'deductions' && s.deductionSign === 'negative' ? -1n : 1n) !==
        BigInt(total)
    )
      issues.push(`Current-period ${name} lines differ from the statement total.`)
  }
  if (s.lines.some((l) => l.code === 'unknown'))
    issues.push('Unrecognized payroll component classification requires review.')
  for (const [label, reported, lines] of [
    ['worked', s.reportedWorkedHundredths, earn.filter((l) => l.worked === true)],
    ['paid', s.reportedPaidHundredths, earn.filter((l) => l.hoursHundredths !== null)],
  ] as const) {
    if (
      reported !== null &&
      reported !== undefined &&
      lines.length &&
      lines.every((l) => l.hoursHundredths !== null) &&
      payrollSum(lines.map((l) => l.hoursHundredths!)) !== reported
    )
      issues.push(`Statement ${label} hours differ from extracted line hours.`)
  }
  return issues
}
export function payrollReviewWarnings(s: PayrollStatement) {
  const unknown = s.lines.filter((l) => l.treatment === 'unknown')
  return unknown.length
    ? [
        `Tax treatment is unspecified for: ${unknown.map((l) => l.label).join(', ')}. The recorded amounts can be saved; tax treatment stays unknown.`,
      ]
    : []
}
