import type {
  PayrollForecast,
  PayrollProfileInput,
  PayrollStatement,
  WeeklyHoursInput,
  PayrollWeek,
} from './payroll'
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
  const regular = payrollRound(BigInt(h.regularHundredths) * BigInt(h.regularRateCents), 100n),
    overtime = payrollRound(BigInt(h.overtimeHundredths) * BigInt(h.overtimeRateCents), 100n),
    pto = payrollRound(BigInt(h.ptoHundredths) * BigInt(h.regularRateCents), 100n),
    holiday = payrollRound(BigInt(h.holidayHundredths) * BigInt(h.regularRateCents), 100n),
    other = payrollRound(BigInt(h.otherPaidHundredths) * BigInt(h.regularRateCents), 100n)
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
    workedHundredths: h.regularHundredths + h.overtimeHundredths,
    paidHundredths:
      h.regularHundredths +
      h.overtimeHundredths +
      h.ptoHundredths +
      h.holidayHundredths +
      h.otherPaidHundredths,
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
  if (s.lines.some((l) => l.code === 'unknown' || l.treatment === 'unknown'))
    issues.push('Unrecognized classification or tax treatment requires review.')
  return issues
}
export function payrollForecast(
  profile: PayrollProfileInput,
  h: WeeklyHoursInput,
  history: { statement: PayrollStatement; reviewedAt: string }[],
  errors: number[] = [],
): PayrollForecast {
  const gross = payrollGross(h),
    warnings: string[] = [],
    samples = history.filter((v) => v.statement.grossCents !== null && v.statement.grossCents > 0)
  const deductions: PayrollForecast['deductions'] = []
  const rules = [...profile.rules]
  for (const code of ['federal', 'social_security', 'medicare', 'state', 'local'] as const)
    if (!rules.some((r) => r.code === code))
      rules.push({
        code,
        label: code.replaceAll('_', ' '),
        applicable: true,
        mode: 'unknown',
        fixedCents: null,
        rateBps: null,
        basis: 'gross',
        annualWageCapCents: null,
        priorTaxableWagesCents: null,
      })
  // Pretax components are resolved first; ambiguous or unknown taxable bases stay unknown.
  const ordered = [...rules].sort(
    (a, b) =>
      Number(!['traditional', 'pretax_benefit'].includes(a.code)) -
      Number(!['traditional', 'pretax_benefit'].includes(b.code)),
  )
  for (const rule of ordered) {
    let amountCents: number | null = null,
      method = 'Unknown',
      sampleCount = 0
    if (!rule.applicable) {
      amountCents = 0
      method = 'User confirmed not applicable'
    } else if (rule.mode === 'fixed') {
      amountCents = rule.fixedCents
      method = 'User-configured fixed deduction'
    } else if (rule.mode === 'rate' && rule.rateBps !== null) {
      const pretax = deductions.filter((d) => ['traditional', 'pretax_benefit'].includes(d.code)),
        missingPretax = rules
          .filter((r) => r.applicable && ['traditional', 'pretax_benefit'].includes(r.code))
          .some((r) => !pretax.some((d) => d.code === r.code && d.amountCents !== null))
      if (rule.basis !== 'gross_less_pretax' || !missingPretax) {
        let basis = Math.max(
          0,
          gross.grossCents -
            (rule.basis === 'gross_less_pretax'
              ? payrollSum(pretax.map((d) => d.amountCents ?? 0))
              : 0),
        )
        if (rule.annualWageCapCents !== null)
          basis = Math.min(
            basis,
            Math.max(0, rule.annualWageCapCents - (rule.priorTaxableWagesCents ?? 0)),
          )
        amountCents = payrollRound(BigInt(basis) * BigInt(rule.rateBps), 10000n)
        method = 'Configured rate and taxable-base assumption; not a tax-table calculation'
      }
    } else if (rule.mode === 'history') {
      const peers = samples
        .map((s) => ({
          gross: s.statement.grossCents!,
          sign: s.statement.deductionSign === 'negative' ? -1 : 1,
          lines: s.statement.lines.filter((l) => l.side === 'deduction' && l.code === rule.code),
        }))
        .filter((s) => s.lines.length && s.lines.every((l) => l.currentCents !== null))
        .sort((a, b) => Math.abs(a.gross - gross.grossCents) - Math.abs(b.gross - gross.grossCents))
        .slice(0, 5)
      sampleCount = peers.length
      if (sampleCount) {
        if (
          gross.grossCents < Math.min(...peers.map((p) => p.gross)) ||
          gross.grossCents > Math.max(...peers.map((p) => p.gross))
        )
          warnings.push(
            `${rule.label}: reported gross is outside the selected historical sample range.`,
          )
        const observed = peers.map((s) => payrollSum(s.lines.map((l) => l.currentCents!)) * s.sign)
        amountCents = payrollRound(
          observed.reduce((n, v) => n + BigInt(v), 0n),
          BigInt(sampleCount),
        )
        method =
          'Mean observed deduction from up to five nearest-gross reviewed paystubs (not a constant tax rate)'
      }
    }
    if (amountCents === null)
      warnings.push(`${rule.label}: unknown; supply a rule or reviewed history.`)
    deductions.push({ code: rule.code, label: rule.label, amountCents, method, sampleCount })
  }
  // A learned model cannot silently omit a deduction observed on a reviewed source.
  for (const code of new Set(
    samples.flatMap((s) =>
      s.statement.lines.filter((l) => l.side === 'deduction').map((l) => l.code),
    ),
  ))
    if (!rules.some((r) => r.code === code)) {
      deductions.push({
        code,
        label: code.replaceAll('_', ' '),
        amountCents: null,
        method: 'Observed component has no configured rule',
        sampleCount: 0,
      })
      warnings.push(`${code}: configure the observed deduction.`)
    }
  let netCents = deductions.every((d) => d.amountCents !== null)
    ? payrollSum([gross.grossCents, -payrollSum(deductions.map((d) => d.amountCents!))])
    : null
  if (netCents !== null && netCents < 0) {
    warnings.push('Deductions exceed forecast gross; review assumptions.')
    netCents = null
  }
  const range =
    netCents !== null && errors.length >= 3
      ? {
          lowCents: Math.max(0, payrollSum([netCents, Math.min(...errors)])),
          highCents: Math.max(0, payrollSum([netCents, Math.max(...errors)])),
          sampleCount: errors.length,
        }
      : null
  return {
    ...gross,
    deductions,
    netCents,
    range,
    confidence: netCents === null ? 'unknown' : range ? 'medium' : 'low',
    warnings,
  }
}
export function payrollComparison(
  week: Pick<PayrollWeek, 'statement' | 'statementReceivedAt' | 'forecasts'>,
) {
  const actual = week.statement,
    forecast = [...week.forecasts]
      .filter(
        (f) =>
          f.eligibleForAccuracy &&
          week.statementReceivedAt &&
          f.createdAt < week.statementReceivedAt,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!actual || !forecast) return null
  const predicted = forecast.result,
    actualDed = (codes: string[]) => {
      const lines = actual.lines.filter((l) => l.side === 'deduction' && codes.includes(l.code))
      return lines.length && lines.every((l) => l.currentCents !== null)
        ? payrollSum(lines.map((l) => l.currentCents!)) *
            (actual.deductionSign === 'negative' ? -1 : 1)
        : null
    },
    predDed = (codes: string[]) => {
      const lines = predicted.deductions.filter((l) => codes.includes(l.code))
      return lines.length && lines.every((l) => l.amountCents !== null)
        ? payrollSum(lines.map((l) => l.amountCents!))
        : null
    },
    errorCents =
      actual.netCents !== null && predicted.netCents !== null
        ? payrollSum([actual.netCents, -predicted.netCents])
        : null
  return {
    forecastId: forecast.id,
    gross: { predicted: predicted.grossCents, actual: actual.grossCents },
    federal: { predicted: predDed(['federal']), actual: actualDed(['federal']) },
    fica: {
      predicted: predDed(['social_security', 'medicare']),
      actual: actualDed(['social_security', 'medicare']),
    },
    deductions: {
      predicted: predicted.netCents === null ? null : predicted.grossCents - predicted.netCents,
      actual: actual.deductionsCents,
    },
    otherDeductions: {
      predicted: predDed([
        'roth',
        'traditional',
        'insurance',
        'disability',
        'pretax_benefit',
        'other_deduction',
      ]),
      actual: actualDed([
        'roth',
        'traditional',
        'insurance',
        'disability',
        'pretax_benefit',
        'other_deduction',
      ]),
    },
    net: { predicted: predicted.netCents, actual: actual.netCents },
    errorCents,
    errorPercent:
      errorCents !== null && actual.netCents
        ? Number(((errorCents / actual.netCents) * 100).toFixed(2))
        : null,
  }
}
