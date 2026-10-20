import { expect, it } from 'vitest'
import {
  payrollForecast,
  payrollGross,
  payrollComparison,
  payrollReconciliation,
} from './payroll-calculations'
import { payrollWorkweek, payrollMilestones } from './payroll-schedule'
import { payrollProfileSchema, type PayrollStatement } from './payroll'
import { profile, hours } from './payroll.fixture'
it('uses exact fractional hours; PTO is paid but never automatically worked overtime', () => {
  expect(payrollGross(hours)).toMatchObject({
    grossCents: 107500,
    workedHundredths: 3375,
    paidHundredths: 4175,
  })
  expect(payrollGross({ ...hours, regularHundredths: 1, overtimeHundredths: 1 })).toMatchObject({
    grossCents: 20063,
  })
})
it('rolls over at Monday midnight in Chicago, including Sunday and DST boundaries', () => {
  expect(payrollWorkweek(new Date('2026-10-12T04:59:59Z'), profile)).toEqual({
    start: '2026-10-05',
    end: '2026-10-11',
  })
  expect(payrollWorkweek(new Date('2026-10-12T05:00:00Z'), profile)).toEqual({
    start: '2026-10-12',
    end: '2026-10-18',
  })
  expect(payrollWorkweek(new Date('2026-11-02T06:00:00Z'), profile).start).toBe('2026-11-02')
  expect(payrollMilestones('2026-10-11', profile)).toEqual({
    hours: '2026-10-11',
    processing: '2026-10-12',
    statement: '2026-10-14',
    deposit: '2026-10-15',
  })
  expect(hours.expectedPayDate).toBe('2026-10-16')
})
it('leaves unknown taxes/net unknown rather than assuming a net percentage', () => {
  expect(payrollForecast(profile, hours, [])).toMatchObject({
    netCents: null,
    confidence: 'unknown',
    range: null,
  })
  expect(payrollForecast(profile, hours, []).deductions).toHaveLength(5)
})
it('separates configured fixed deductions, rates and explicit non-applicability', () => {
  const rules = ['federal', 'social_security', 'medicare', 'state', 'local'].map((code) => ({
    code,
    label: code,
    applicable: false,
    mode: 'unknown',
    fixedCents: null,
    rateBps: null,
    basis: 'gross',
    annualWageCapCents: null,
    priorTaxableWagesCents: null,
  }))
  const p = payrollProfileSchema.parse({
    ...profile,
    rules: [
      ...rules,
      {
        code: 'insurance',
        label: 'Fictional fixed premium',
        applicable: true,
        mode: 'fixed',
        fixedCents: 5000,
        rateBps: null,
        basis: 'gross',
        annualWageCapCents: null,
        priorTaxableWagesCents: null,
      },
    ],
  })
  expect(payrollForecast(p, hours, [], [-100, 200, 50])).toMatchObject({
    netCents: 102500,
    range: { lowCents: 102400, highCents: 102700, sampleCount: 3 },
  })
})
it('does not include employer taxes or YTD amounts in current reconciliation', () => {
  const s: PayrollStatement = {
    employer: null,
    assignment: null,
    periodStart: null,
    periodEnd: null,
    payDate: null,
    grossCents: 100000,
    deductionsCents: 20000,
    netCents: 80000,
    acknowledgement: null,
    lines: [
      {
        label: 'Fictional earnings',
        side: 'earnings',
        code: 'regular',
        treatment: 'not_applicable',
        currentCents: 100000,
        ytdCents: 900000,
        rateCents: null,
        hoursHundredths: null,
        worked: true,
        confidence: 'manual',
      },
      {
        label: 'Federal',
        side: 'deduction',
        code: 'federal',
        treatment: 'posttax',
        currentCents: 20000,
        ytdCents: 180000,
        rateCents: null,
        hoursHundredths: null,
        worked: null,
        confidence: 'manual',
      },
      {
        label: 'Employer tax',
        side: 'employer_tax',
        code: 'social_security',
        treatment: 'not_applicable',
        currentCents: 6200,
        ytdCents: null,
        rateCents: null,
        hoursHundredths: null,
        worked: null,
        confidence: 'manual',
      },
    ],
  }
  expect(payrollReconciliation(s)).toEqual([])
  expect(payrollReconciliation({ ...s, netCents: 70000 })).not.toEqual([])
  expect(
    payrollComparison({
      statement: s,
      statementReceivedAt: '2026-10-15T00:00:00Z',
      forecasts: [
        {
          id: profile.sourceId,
          createdAt: '2026-10-16T00:00:00Z',
          modelVersion: 1,
          eligibleForAccuracy: false,
          result: payrollForecast(profile, hours, []),
        },
      ],
    }),
  ).toBeNull()
})
