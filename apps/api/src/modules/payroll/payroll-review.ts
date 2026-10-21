import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  incomeTransactionSchema,
  payrollStatementSchema,
  payrollReconciliation,
  payrollStatementHours,
  type IncomeTransactionInput,
  type IncomeSource,
  type PayrollWeek,
  type PublicUser,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import type { IncomeService } from '../income/income.service'
import { FinancialError } from '../households/financial-access'
type ReviewAccess = {
  source: (user: PublicUser, home: string, id: string, write?: boolean) => IncomeSource
  week: (user: PublicUser, home: string, id: string, revision?: number) => PayrollWeek
  view: (user: PublicUser, home: string, w: PayrollWeek) => PayrollWeek
}
const change = z.object({
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(2000),
})
export function reviewPayroll(
  store: PayrollRepository,
  income: IncomeService,
  access: ReviewAccess,
  user: PublicUser,
  home: string,
  id: string,
  body: unknown,
  upload?: { receivedAt: string; sourceConfirmed: boolean },
) {
  const { week, source, view } = access
  const p = z
    .object({
      statement: payrollStatementSchema,
      documentDigest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      ...change.shape,
    })
    .strict()
    .parse(body)
  return store.atomic(() => {
    const w = week(user, home, id, p.revision),
      s = source(user, home, w.sourceId, true),
      v = p.statement,
      issues = payrollReconciliation(v)
    const expectedEmployer = JSON.parse(store.rawWeek(home, id)!.profileSnapshotJson)
      .employer as string
    if (
      !upload?.sourceConfirmed &&
      (!v.employer || v.employer.toLowerCase().trim() !== expectedEmployer.toLowerCase().trim())
    )
      issues.push(
        'Employer does not match the saved payroll profile. Confirm the source and acknowledge any legitimate name difference.',
      )
    if (
      !v.periodStart ||
      !v.periodEnd ||
      !v.payDate ||
      v.grossCents === null ||
      v.deductionsCents === null ||
      v.netCents === null
    )
      throw new FinancialError('Confirm work period, pay date, gross, deductions and net', 400)
    if (v.periodStart !== w.workweekStart || v.periodEnd !== w.workweekEnd)
      throw new FinancialError(
        'Statement period must match this payroll week; choose the correct week',
        409,
      )
    if (issues.length && !v.acknowledgement)
      throw new FinancialError(
        'Resolve reconciliation issues or enter an explicit discrepancy acknowledgement',
        400,
      )
    if (p.documentDigest && store.digest(home, p.documentDigest))
      throw new FinancialError(
        'This document has already been reviewed; correct the existing paycheck',
        409,
      )
    const old = w.incomeTransactionId
      ? income.list(user, home).transactions.find((t) => t.id === w.incomeTransactionId)
      : income
          .list(user, home)
          .transactions.find(
            (t) =>
              t.sourceId === s.id &&
              ((t.workPeriodStart === v.periodStart && t.workPeriodEnd === v.periodEnd) ||
                (!t.workPeriodStart && !t.workPeriodEnd && t.payDate === v.payDate)) &&
              t.status !== 'cancelled',
          )
    const actualHours = payrollStatementHours(v),
      regularHours = actualHours.regularHundredths ?? w.regularHundredths,
      overtimeHours = actualHours.overtimeHundredths ?? w.overtimeHundredths
    const values: IncomeTransactionInput = incomeTransactionSchema.parse({
      sourceId: s.id,
      workPeriodStart: v.periodStart,
      workPeriodEnd: v.periodEnd,
      regularHours: regularHours === null ? null : (regularHours / 100).toFixed(2),
      overtimeHours: overtimeHours === null ? null : (overtimeHours / 100).toFixed(2),
      hourlyRateCents: actualHours.regularRateCents ?? w.regularRateCents,
      overtimeMultiplier: old?.overtimeMultiplier ?? s.overtimeMultiplier,
      expectedGrossCents: w.forecasts.at(-1)?.result.grossCents ?? old?.expectedGrossCents ?? null,
      expectedNetCents: w.forecasts.at(-1)?.result.netCents ?? old?.expectedNetCents ?? null,
      actualGrossCents: v.grossCents,
      deductionsCents: v.deductionsCents,
      actualNetCents: old?.status === 'confirmed' ? old.actualNetCents : v.netCents,
      payDate: v.payDate,
      depositDate: old?.status === 'confirmed' ? old.depositDate : null,
      status: old?.status === 'confirmed' ? 'confirmed' : 'pending',
      reference: old?.reference ?? null,
      notes: old?.notes ?? 'Reviewed payroll statement; deposit requires separate confirmation',
      receiptConfirmed: old?.status === 'confirmed',
      tradingPayoutWithdrawn: false,
    })
    const transaction = old
        ? income.editTransaction(
            user,
            home,
            old.id,
            { revision: old.revision, reason: p.reason, values },
            false,
            true,
          )
        : income.createTransaction(user, home, { idempotencyKey: randomUUID(), values }),
      now = new Date().toISOString(),
      statementId = randomUUID(),
      { lines, ...header } = v
    const firstSeen = p.documentDigest
      ? store
          .history(home, s.id)
          .filter(
            (a) =>
              a.action === 'upload_preview_received' &&
              JSON.parse(a.afterJson).digest === p.documentDigest,
          )
          .map((a) => JSON.parse(a.afterJson).receivedAt as string)
          .sort()[0]
      : undefined
    store.insertStatement(
      {
        id: statementId,
        householdId: home,
        sourceId: s.id,
        weekId: id,
        headerJson: JSON.stringify(header),
        documentDigest: p.documentDigest,
        grossCents: v.grossCents,
        deductionsCents: v.deductionsCents,
        netCents: v.netCents,
        reviewedByUserId: user.id,
        createdAt: now,
      },
      lines.map((l, position) => ({
        ...l,
        id: randomUUID(),
        householdId: home,
        statementId,
        position,
      })),
    )
    store.patch(home, id, {
      incomeTransactionId: transaction.id,
      statementId,
      stage: transaction.status === 'confirmed' ? 'deposit_confirmed' : 'paystub_reviewed',
      statementReceivedAt:
        [w.statementReceivedAt, upload?.receivedAt, firstSeen]
          .filter((v): v is string => Boolean(v))
          .sort()[0] ?? now,
      reviewedAt: now,
      revision: w.revision + 1,
      updatedAt: now,
    })
    store.audit(home, s.id, id, user.id, 'paystub_reviewed', w.statement, {
      statementId,
      incomeTransactionId: transaction.id,
      issues,
      acknowledgement: v.acknowledgement,
      reason: p.reason,
    })
    return view(
      user,
      home,
      store.weeks(home).find((w) => w.id === id)!,
    )
  })
}
