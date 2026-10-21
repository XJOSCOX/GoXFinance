import { hasPayrollBonus, historicalPayrollDeduction } from './payroll-learning'
import { employeePayrollTax } from './payroll-taxes'
import type {
  PayrollForecast,
  PayrollProfileInput,
  PayrollStatement,
  WeeklyHoursInput,
} from './payroll'
import { payrollGross, payrollRound, payrollSum, payrollReconciliation } from './payroll-arithmetic'
export function payrollForecast(
  profile: PayrollProfileInput,
  h: WeeklyHoursInput,
  history: { statement: PayrollStatement; reviewedAt: string; sourceId?: string }[],
  errors: number[] = [],
  asOf = new Date().toISOString(),
): PayrollForecast {
  const gross = payrollGross(h),
    warnings: string[] = [],
    eligible = history.filter(
      (v) =>
        (!v.sourceId || v.sourceId === h.sourceId) &&
        v.reviewedAt < asOf &&
        (!v.statement.periodEnd || v.statement.periodEnd < h.workweekStart) &&
        v.statement.grossCents !== null &&
        v.statement.grossCents > 0 &&
        payrollReconciliation(v.statement).length === 0,
    ),
    samples = eligible.filter((v) => hasPayrollBonus(v.statement) === (h.bonusCents !== 0)),
    excludedBonusSamples = eligible.length - samples.length
  const earnings: PayrollForecast['earnings'] = gross.earnings.map((e) => ({
    ...e,
    label: e.code.replaceAll('_', ' '),
    method: 'User-entered hours/rate or amount',
    sampleCount: 0,
  }))
  const recurring = (profile.recurringEarnings ?? []).filter((r) => r.enabled)
  const recurringTotal =
    h.otherEarningsCents !== 0 ? 0 : payrollSum(recurring.map((r) => r.amountCents))
  if (h.otherEarningsCents !== 0 && recurring.length)
    warnings.push(
      'Recurring additions were not added because user-entered additional earnings may already contain them. Review the gross breakdown.',
    )
  if (h.otherEarningsCents === 0)
    for (const r of recurring)
      earnings.push({
        code: r.code,
        label: r.label,
        amountCents: r.amountCents,
        method: 'Fixed recurring amount approved for this employer',
        sampleCount: 0,
      })
  gross.grossCents = payrollSum([gross.grossCents, recurringTotal])
  if (excludedBonusSamples)
    warnings.push(
      `${excludedBonusSamples} paycheck(s) with a different bonus pattern excluded; bonus withholding cannot be separated reliably.`,
    )
  const componentHistory = h.estimateDeductionsFromHistory && samples.length >= 3
  const observedCodes = new Set(
    samples.flatMap((s) =>
      s.statement.lines.filter((l) => l.side === 'deduction').map((l) => l.code),
    ),
  )
  const deductions: PayrollForecast['deductions'] = []
  const rules = profile.rules
    .map((r) => ({ ...r }))
    .filter((r) => !componentHistory || r.mode !== 'unknown' || observedCodes.has(r.code))
  if (componentHistory)
    for (const code of observedCodes)
      if (!rules.some((r) => r.code === code))
        rules.push({
          code,
          label: code.replaceAll('_', ' '),
          applicable: true,
          mode: 'history',
          fixedCents: null,
          rateBps: null,
          basis: 'gross',
          annualWageCapCents: null,
          priorTaxableWagesCents: null,
        })
  if (componentHistory)
    for (const r of rules) if (r.mode === 'unknown' && observedCodes.has(r.code)) r.mode = 'history'
  for (const code of ['federal', 'social_security', 'medicare', 'state', 'local'] as const)
    if (!componentHistory && !rules.some((r) => r.code === code))
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
    } else if (rule.mode === 'rate' || rule.mode === 'payroll_tax') {
      const pretax = deductions.filter((d) => ['traditional', 'pretax_benefit'].includes(d.code))
      const missingPretax = rules.some(
        (r) =>
          r.applicable &&
          ['traditional', 'pretax_benefit'].includes(r.code) &&
          !pretax.some((d) => d.code === r.code && d.amountCents !== null),
      )
      let base: number | null =
        rule.basis === 'explicit'
          ? (rule.taxableWagesCents ?? null)
          : rule.basis === 'gross_less_pretax'
            ? missingPretax
              ? null
              : Math.max(0, gross.grossCents - payrollSum(pretax.map((d) => d.amountCents!)))
            : rule.basis === 'gross_less_recurring'
              ? h.otherEarningsCents !== 0
                ? null
                : Math.max(0, gross.grossCents - recurringTotal)
              : gross.grossCents
      if (rule.mode === 'payroll_tax') {
        amountCents = employeePayrollTax(rule, h, base)
        if (amountCents === null)
          warnings.push(
            `${rule.label}: official payroll rule inputs are incomplete, for another payday, or an unsupported year; taxable wages and prior wages were not invented.`,
          )
        method = `Payroll tax rule (employee only): ${rule.taxYear ?? 'unknown year'}, ${rule.basis} taxable-wage assumption, prior employer wages ${rule.priorTaxableWagesCents ?? 'unknown'} cents; valid only for ${rule.priorWagesForPayDate ?? 'unspecified payday'}`
      } else if (base !== null && rule.rateBps !== null) {
        if (rule.annualWageCapCents !== null)
          base = Math.min(base, Math.max(0, rule.annualWageCapCents - rule.priorTaxableWagesCents!))
        amountCents = payrollRound(BigInt(base) * BigInt(rule.rateBps), 10000n)
        method = `Configured rate ${rule.rateBps / 100}% on ${base} cents (${rule.basis}); not an official withholding calculation`
      }
    } else if (rule.mode === 'history') {
      const estimate = historicalPayrollDeduction(samples, rule.code, gross.grossCents)
      amountCents = estimate.amountCents
      method = estimate.method
      sampleCount = estimate.sampleCount
      if (estimate.outliers)
        warnings.push(
          `${rule.label}: ${estimate.outliers} extreme effective-withholding outlier(s) excluded from comparable history.`,
        )
      const amounts = samples.map((s) => s.statement.grossCents!)
      if (
        amounts.length &&
        (gross.grossCents < Math.min(...amounts) || gross.grossCents > Math.max(...amounts))
      )
        warnings.push(
          `${rule.label}: forecast gross is outside comparable historical gross; using a historical average, not extrapolated tax tables.`,
        )
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
  if (
    h.estimateDeductionsFromHistory &&
    !componentHistory &&
    !profile.rules.some(
      (r) => !r.applicable || ['fixed', 'rate', 'payroll_tax'].includes(r.mode),
    ) &&
    deductions.some((d) => d.amountCents === null)
  ) {
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
    earnings,
    explanation: {
      algorithm: componentHistory ? 'component-history-v2' : 'configured-or-total-history-v1',
      sampleCount: samples.length,
      totalDeductionsCents: deductions.every((d) => d.amountCents !== null)
        ? payrollSum(deductions.map((d) => d.amountCents!))
        : null,
      excludedBonusSamples,
      asOf,
      timeBasis:
        'Clock minutes are divided by 60; decimal hundredths by 100. Worked time and paid nonworked time remain separate.',
    },
    deductions,
    netCents,
    range,
    confidence:
      netCents === null
        ? 'unknown'
        : range ||
            (componentHistory &&
              samples.length >= 5 &&
              !warnings.some((w) => w.includes('outside')))
          ? 'medium'
          : 'low',
    warnings,
  }
}
