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
  if (s.lines.some((l) => l.code === 'unknown' || l.treatment === 'unknown'))
    issues.push('Unrecognized classification or tax treatment requires review.')
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
  if (h.estimateDeductionsFromHistory && deductions.some((d) => d.amountCents === null)) {
    const peers = samples
      .filter(
        (v) =>
          payrollReconciliation(v.statement).length === 0 &&
          v.statement.deductionsCents !== null &&
          v.statement.netCents !== null,
      )
      .sort(
        (a, b) =>
          Math.abs(a.statement.grossCents! - gross.grossCents) -
          Math.abs(b.statement.grossCents! - gross.grossCents),
      )
      .slice(0, 5)
    if (peers.length) {
      const projected = peers.map((p) =>
        payrollRound(
          BigInt(gross.grossCents) * BigInt(p.statement.deductionsCents!),
          BigInt(p.statement.grossCents!),
        ),
      )
      const amountCents = payrollRound(
        projected.reduce((n, v) => n + BigInt(v), 0n),
        BigInt(peers.length),
      )
      deductions.splice(0, deductions.length, {
        code: 'historical_total',
        label: 'Estimated total deductions',
        amountCents,
        sampleCount: peers.length,
        method:
          'Mean deduction-to-gross ratio from up to five nearest-gross reviewed prior paychecks; not a tax calculation',
      })
      for (let i = warnings.length - 1; i >= 0; i--)
        if (
          warnings[i].includes('unknown; supply a rule') ||
          warnings[i].includes('configure the observed deduction')
        )
          warnings.splice(i, 1)
      warnings.push(
        'Take-home uses historical total deductions, not individual tax rules. Benefits, withholding and hours can change; confirm the actual paystub.',
      )
      if (
        gross.grossCents < Math.min(...peers.map((p) => p.statement.grossCents!)) ||
        gross.grossCents > Math.max(...peers.map((p) => p.statement.grossCents!))
      )
        warnings.push('Estimated gross is outside the historical sample range.')
    }
  }
  let netCents = deductions.every((d) => d.amountCents !== null)
    ? payrollSum([gross.grossCents, -payrollSum(deductions.map((d) => d.amountCents!))])
    : null
  if (netCents !== null && netCents < 0) {
    warnings.push('Deductions exceed forecast gross; review assumptions.')
    netCents = null
  }
  const range =
    netCents !== null &&
    errors.length >= 3 &&
    !deductions.some((d) => d.code === 'historical_total')
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
  week: Pick<
    PayrollWeek,
    'statement' | 'statementReceivedAt' | 'forecasts' | 'forecastPeriodReconciled'
  >,
) {
  if (week.forecastPeriodReconciled) return null
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
