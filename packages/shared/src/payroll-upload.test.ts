import { expect, it } from 'vitest'
import { payrollImportedHours, payrollStatementHours } from './payroll-upload'
import { payrollReconciliation } from './payroll-calculations'
import type { PayrollStatement, PayrollLine } from './payroll'
const line = (
  code: PayrollLine['code'],
  hoursHundredths: number | null,
  worked: boolean | null,
): PayrollLine => ({
  label: code,
  code,
  hoursHundredths,
  worked,
  side: 'earnings',
  rateCents: 2500,
  currentCents: 0,
  ytdCents: null,
  treatment: 'not_applicable',
  confidence: 'manual',
})
const statement: PayrollStatement = {
  employer: 'Fictional Payroll',
  assignment: null,
  periodStart: '2026-10-05',
  periodEnd: '2026-10-11',
  payDate: '2026-10-16',
  grossCents: 0,
  deductionsCents: 0,
  netCents: 0,
  acknowledgement: null,
  lines: [
    line('regular', 3125, true),
    line('overtime', 250, true),
    line('pto', 800, false),
    line('regular', 25, true),
  ],
}
it('preserves fractional and multiple earnings lines without counting PTO as worked hours', () => {
  expect(payrollStatementHours(statement)).toMatchObject({
    regularHundredths: 3150,
    overtimeHundredths: 250,
    ptoHundredths: 800,
    workedHundredths: 3400,
    paidHundredths: 4200,
  })
  const imported = payrollImportedHours(
    statement,
    '11111111-1111-4111-8111-111111111111',
    '2026-10-15',
  )
  expect(imported).toMatchObject({
    documentOnly: true,
    regularHundredths: 3150,
    holidayHundredths: null,
    expectedPayDate: '2026-10-15',
  })
})
it('keeps incomplete hours unknown and checks printed totals without rewriting actual earnings', () => {
  const incomplete = { ...statement, lines: [line('regular', null, true), line('pto', 800, false)] }
  expect(payrollStatementHours(incomplete)).toMatchObject({
    regularHundredths: null,
    workedHundredths: null,
    paidHundredths: null,
  })
  expect(
    payrollReconciliation({
      ...statement,
      reportedWorkedHundredths: 3500,
      reportedPaidHundredths: 4200,
    }),
  ).toContain('Statement worked hours differ from extracted line hours.')
  expect(statement.lines[0].currentCents).toBe(0)
})
