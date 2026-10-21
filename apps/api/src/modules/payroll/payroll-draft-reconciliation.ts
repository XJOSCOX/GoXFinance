import {
  payrollImportedHours,
  weeklyHoursSchema,
  type PayrollWeek,
  type PayrollStatement,
  type PayrollFrequency,
  type PublicUser,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import { FinancialError } from '../households/financial-access'
export function isPayrollDraft(w: PayrollWeek) {
  return (
    ['hours_draft', 'hours_submitted', 'payroll_pending'].includes(w.stage) &&
    !w.statementReceivedAt &&
    !w.statement &&
    !w.incomeTransactionId
  )
}
export function uploadExistingWeek(
  weeks: PayrollWeek[],
  sourceId: string,
  start: string,
  draftWeekId?: string,
) {
  if (!draftWeekId) return weeks.find((w) => w.sourceId === sourceId && w.workweekStart === start)
  const draft = weeks.find((w) => w.id === draftWeekId && w.sourceId === sourceId)
  if (!draft) throw new FinancialError('Saved estimate not found for this employer', 404)
  if (!isPayrollDraft(draft))
    throw new FinancialError(
      'This estimate already has a statement. Review the existing paycheck.',
      409,
    )
  return draft
}
export function reconcileDraftPeriod(
  store: PayrollRepository,
  home: string,
  user: PublicUser,
  w: PayrollWeek,
  statement: PayrollStatement,
  frequency: PayrollFrequency,
  split: number,
  reason: string,
) {
  if (w.workweekStart === statement.periodStart && w.workweekEnd === statement.periodEnd) return
  if (!isPayrollDraft(w))
    throw new FinancialError(
      'Only an unreviewed estimate can be reconciled to different statement dates.',
      409,
    )
  const values = weeklyHoursSchema.parse({
    ...payrollImportedHours(
      statement,
      w.sourceId,
      statement.payDate,
      frequency,
      split,
      w.periodAnchor ?? null,
    ),
    expectedDepositBasis: 'statement',
    forecastPeriodReconciled: true,
  })
  store.patch(home, w.id, {
    workweekStart: statement.periodStart!,
    workweekEnd: statement.periodEnd!,
    hoursJson: JSON.stringify(values),
    updatedAt: new Date().toISOString(),
  })
  store.audit(home, w.sourceId, w.id, user.id, 'draft_period_reconciled', w, {
    hours: values,
    reason,
    forecastIds: w.forecasts.map((f) => f.id),
  })
}
