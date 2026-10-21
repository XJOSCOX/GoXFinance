import { payrollStatementSchema, type PayrollWeek } from './payroll'
import { hours, profile } from './payroll.fixture'
// Fictional varying wages and premiums, unrelated to uploaded documents.
export function syntheticStatement(index: number, bonus = false) {
  const regular = 80000 + (index % 4) * 20000,
    addition = 300,
    extra = bonus ? 75000 : 0,
    federal = 8000 + (regular - 80000) / 5 + (bonus ? 18000 : 0),
    roth = Math.round(regular * 0.07)
  const line = (label: string, side: string, code: string, currentCents: number, more = {}) => ({
    label,
    side,
    code,
    currentCents,
    treatment: 'posttax',
    ytdCents: null,
    hoursHundredths: null,
    rateCents: null,
    worked: null,
    confidence: 'manual',
    ...more,
  })
  const date = new Date(Date.UTC(2026, 0, 5 + index * 7)),
    day = (offset: number) =>
      new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10)
  return payrollStatementSchema.parse({
    employer: 'Synthetic Testing Employer',
    assignment: null,
    periodStart: day(0),
    periodEnd: day(6),
    payDate: day(11),
    grossCents: regular + addition + extra,
    deductionsCents: federal + roth + addition,
    netCents: regular + extra - federal - roth,
    acknowledgement: null,
    lines: [
      line('Regular', 'earnings', 'regular', regular, {
        hoursHundredths: regular / 25,
        rateCents: 2500,
        worked: true,
        treatment: 'not_applicable',
      }),
      line('Synthetic premium credit', 'earnings', 'disability', addition, {
        treatment: 'not_applicable',
      }),
      ...(bonus ? [line('One-time award', 'earnings', 'bonus', extra)] : []),
      line('Federal withholding', 'deduction', 'federal', federal),
      line('Roth contribution', 'deduction', 'roth', roth),
      line('Premium', 'deduction', 'disability', addition),
    ],
  })
}
export function syntheticWeeks(count = 10): PayrollWeek[] {
  return Array.from({ length: count }, (_, i) => {
    const statement = syntheticStatement(i, i === 7)
    return {
      ...hours,
      id: `week-${i}`,
      householdId: 'synthetic',
      sourceId: profile.sourceId,
      workweekStart: statement.periodStart!,
      workweekEnd: statement.periodEnd!,
      expectedPayDate: statement.payDate,
      stage: 'paystub_reviewed',
      revision: 1,
      incomeTransactionId: null,
      statementReceivedAt: statement.payDate,
      reviewedAt: statement.payDate + 'T12:00:00Z',
      createdAt: statement.payDate!,
      updatedAt: statement.payDate!,
      statement,
      forecasts: [],
      canManage: false,
    }
  })
}
