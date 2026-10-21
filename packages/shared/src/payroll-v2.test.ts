import { expect, it } from 'vitest'
import { profile, hours } from './payroll.fixture'
import { syntheticStatement, syntheticWeeks } from './payroll-v2.fixture'
import { payrollLearningSuggestions, historicalPayrollDeduction } from './payroll-learning'
import { payrollForecast } from './payroll-forecast'
import { payrollBacktest } from './payroll-backtest'
import { employeePayrollTax } from './payroll-taxes'
import { deductionRuleSchema } from './payroll'
const observations = [0, 1, 2, 3, 4, 5].map((i) => ({
  statement: syntheticStatement(i),
  sourceId: profile.sourceId,
  reviewedAt: '2026-03-01T00:00:00Z',
}))
const futureHours = {
  ...hours,
  workweekStart: '2026-04-06',
  workweekEnd: '2026-04-12',
  expectedPayDate: '2026-04-17',
  regularHundredths: 4000,
  regularMinutes: 2400,
  overtimeHundredths: 63,
  overtimeMinutes: 38,
  ptoHundredths: 0,
  estimateDeductionsFromHistory: true,
}
it('suggests source-specific additions and Roth rates but applies neither without approval', () => {
  const suggestions = payrollLearningSuggestions(observations, profile, '2026-04-01T00:00:00Z')
  expect(suggestions.recurring).toEqual([
    { code: 'disability', label: 'Synthetic premium credit', amountCents: 300, enabled: true },
  ])
  expect(suggestions.deductions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'roth',
        mode: 'rate',
        rateBps: 700,
        basis: 'gross_less_recurring',
      }),
      expect.objectContaining({ code: 'disability', mode: 'fixed', fixedCents: 300 }),
    ]),
  )
  expect(
    payrollLearningSuggestions(
      observations.map((o) => ({ ...o, sourceId: crypto.randomUUID() })),
      profile,
    ).sampleCount,
  ).toBe(0)
  expect(
    payrollLearningSuggestions(observations, profile, '2026-01-01T00:00:00Z').sampleCount,
  ).toBe(0)
  expect(payrollForecast(profile, futureHours, observations).grossCents).toBe(102375)
  const approved = {
    ...profile,
    recurringEarnings: suggestions.recurring,
    rules: suggestions.deductions,
  }
  const forecast = payrollForecast(approved, futureHours, observations)
  expect(forecast.grossCents).toBe(102675)
  expect(forecast.earnings.find((e) => e.code === 'overtime')?.amountCents).toBe(2375)
  expect(forecast.deductions.find((d) => d.code === 'disability')?.amountCents).toBe(300)
  expect(forecast.deductions.find((d) => d.code === 'roth')?.amountCents).toBe(7166)
  expect(forecast.earnings.reduce((n, e) => n + e.amountCents, 0)).toBe(forecast.grossCents)
  expect(forecast.netCents).toBe(forecast.grossCents - forecast.explanation!.totalDeductionsCents!)
  expect(
    payrollForecast(
      {
        ...approved,
        recurringEarnings: suggestions.recurring.map((r) => ({ ...r, enabled: false })),
      },
      futureHours,
      observations,
    ).grossCents,
  ).toBe(102375)
  expect(
    payrollForecast(approved, { ...futureHours, otherEarningsCents: 300 }, observations).grossCents,
  ).toBe(102675)
})
it('interpolates federal withholding, handles exact gross and excludes one-time bonuses and future observations', () => {
  expect(historicalPayrollDeduction(observations, 'federal', 90300).amountCents).toBe(10000)
  expect(historicalPayrollDeduction(observations, 'federal', 100300).amountCents).toBe(12000)
  const bonus = { ...observations[0], statement: syntheticStatement(7, true) }
  const f = payrollForecast(profile, futureHours, [
    ...observations,
    bonus,
    { ...bonus, reviewedAt: '2099-01-01T00:00:00Z' },
  ])
  expect(f.explanation?.excludedBonusSamples).toBe(1)
  expect(f.explanation?.sampleCount).toBe(6)
  expect(
    payrollForecast(profile, { ...futureHours, estimateDeductionsFromHistory: false }, []).netCents,
  ).toBeNull()
})
it('uses explicit employer taxable wages, annual caps, additional Medicare and payday-scoped prior wages', () => {
  const rule = deductionRuleSchema.parse({
    code: 'social_security',
    label: 'SS',
    applicable: true,
    mode: 'payroll_tax',
    basis: 'gross',
    taxYear: 2026,
    priorWagesForPayDate: futureHours.expectedPayDate,
    priorTaxableWagesCents: 18449000,
    annualWageCapCents: null,
    fixedCents: null,
    rateBps: null,
  })
  expect(employeePayrollTax(rule, futureHours, 100000)).toBe(62)
  expect(
    employeePayrollTax({ ...rule, priorTaxableWagesCents: null }, futureHours, 100000),
  ).toBeNull()
  expect(
    employeePayrollTax({ ...rule, priorWagesForPayDate: '2026-04-10' }, futureHours, 100000),
  ).toBeNull()
  expect(employeePayrollTax({ ...rule, taxYear: 2025 }, futureHours, 100000)).toBeNull()
  expect(
    employeePayrollTax({ ...rule, basis: 'gross_less_pretax' }, futureHours, 100000),
  ).toBeNull()
  expect(
    employeePayrollTax(
      { ...rule, code: 'medicare', priorTaxableWagesCents: 19950000 },
      futureHours,
      100000,
    ),
  ).toBe(1900)
})
it('backtests chronologically without rewriting history, distinguishes bonus and prior sample counts', () => {
  const weeks = syntheticWeeks(),
    before = JSON.stringify(weeks),
    r = payrollBacktest(weeks, profile)
  expect(r.results[0].sampleCount).toBe(0)
  expect(r.results[1].sampleCount).toBe(1)
  expect(r.bonus.evaluated).toBe(0)
  expect(r.summary.evaluated).toBeGreaterThan(0)
  expect(r.summary.maeCents).not.toBeNull()
  expect(JSON.stringify(weeks)).toBe(before)
  const withoutFuture = payrollBacktest(weeks.slice(0, 5), profile)
  expect(r.results.slice(0, 5)).toEqual(withoutFuture.results)
})

it('flags extreme withholding outliers and keeps observed employer taxes outside employee deductions', () => {
  const outlier = structuredClone(observations[0])
  outlier.statement.lines.find((l) => l.code === 'federal')!.currentCents = 70000
  outlier.statement.deductionsCents = 75900
  outlier.statement.netCents = 4400
  const estimate = historicalPayrollDeduction([...observations, outlier], 'federal', 100300)
  expect(estimate.outliers).toBe(1)
  expect(estimate.amountCents).toBe(12000)
  const copy = structuredClone(observations)
  for (const o of copy) {
    o.statement.lines.push({ ...o.statement.lines[3], side: 'employer_tax', currentCents: 99999 })
  }
  expect(payrollForecast(profile, futureHours, copy).netCents).toBe(
    payrollForecast(profile, futureHours, observations).netCents,
  )
})
it('requires explicit approval for learned additions, skips insufficient samples and never mutates rules', () => {
  expect(payrollLearningSuggestions(observations.slice(0, 2), profile).recurring).toHaveLength(0)
  const p = {
      ...profile,
      recurringEarnings: [
        {
          code: 'disability' as const,
          label: 'Synthetic premium credit',
          amountCents: 300,
          enabled: false,
        },
      ],
    },
    before = JSON.stringify(p)
  expect(payrollLearningSuggestions(observations, p).recurring).toHaveLength(0)
  payrollForecast(p, futureHours, observations)
  expect(JSON.stringify(p)).toBe(before)
})
