import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  payrollProfileSchema,
  payrollStatementSchema,
  payrollImportedHours,
  weeklyHoursSchema,
  payrollFrequencies,
  payrollPeriodIssue,
  payrollPeriodCandidates,
  payrollStatementHours,
  incomeSourceSchema,
  type PublicUser,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import type { IncomeService } from '../income/income.service'
import { FinancialError } from '../households/financial-access'
import { reviewPayroll } from './payroll-review'
import { readUploadReceipt } from './payroll-upload-receipt'
import { payrollUploadPreview } from './payroll-upload-preview'
import type { PayrollUploadAccess } from './payroll-upload-access'
import { automaticPayrollProfile } from './payroll-auto-source'
export function payrollUploadService(
  store: PayrollRepository,
  income: IncomeService,
  access: PayrollUploadAccess,
) {
  return {
    preview: payrollUploadPreview(store, income, access),
    save(user: PublicUser, home: string, body: unknown) {
      const p = z
        .object({
          receipt: z.string().max(256000),
          sourceId: z.uuid().optional(),
          newSource: z
            .object({ name: z.string().trim().min(1).max(160) })
            .strict()
            .optional(),
          statement: payrollStatementSchema,
          idempotencyKey: z.uuid(),
          profile: payrollProfileSchema.optional(),
          payFrequency: z.enum(payrollFrequencies).optional(),
          semiMonthlySplitDay: z.number().int().min(1).max(27).optional(),
          reason: z.string().trim().min(1).max(2000).default('Reviewed uploaded paycheck'),
        })
        .strict()
        .parse(body)
      const receipt = readUploadReceipt(p.receipt, home, user.id),
        hash = createHash('sha256').update(JSON.stringify(p)).digest('hex')
      return store.atomic(() => {
        const replay = store.importReplay(home, p.idempotencyKey)
        if (replay) {
          access.source(user, home, replay.sourceId, true)
          const previous = JSON.parse(replay.afterJson)
          if (
            previous.hash !== hash ||
            replay.actorUserId !== user.id ||
            (p.sourceId !== undefined && replay.sourceId !== p.sourceId)
          )
            throw new FinancialError('Submission key already used', 409)
          return access.list(user, home).weeks.find((w) => w.id === replay.weekId)!
        }
        if (Boolean(p.sourceId) === Boolean(p.newSource))
          throw new FinancialError(
            'Choose an existing income source or create one from this employer',
            400,
          )
        const candidateFrequency =
          p.payFrequency ??
          p.statement.payFrequency ??
          (payrollPeriodCandidates(p.statement.periodStart, p.statement.periodEnd).length === 1
            ? payrollPeriodCandidates(p.statement.periodStart, p.statement.periodEnd)[0]
            : undefined)
        let sourceId = p.sourceId
        if (p.newSource) {
          const member = access.createMember(user, home)
          if (!member || member.id !== receipt.createMemberId)
            throw new FinancialError(
              'New payroll sources can only be created for your authorized active membership',
              403,
            )
          if (!candidateFrequency)
            throw new FinancialError('Confirm the pay frequency before creating this source', 400)
          if (
            income
              .list(user, home)
              .sources.some(
                (s) =>
                  s.responsibleMemberId === member.id &&
                  s.name.toLowerCase().trim() === p.newSource!.name.toLowerCase().trim(),
              )
          )
            throw new FinancialError('This source already exists. Upload again to match it.', 409)
          const h = payrollStatementHours(p.statement),
            ratio =
              h.regularRateCents && h.overtimeRateCents
                ? String(Math.round((h.overtimeRateCents / h.regularRateCents) * 1000) / 1000)
                : '1'
          sourceId = income.createSource(user, home, {
            idempotencyKey: p.idempotencyKey,
            values: incomeSourceSchema.parse({
              responsibleMemberId: member.id,
              name: p.newSource.name,
              incomeType: h.regularRateCents !== null ? 'hourly' : 'other',
              frequency: candidateFrequency,
              hourlyRateCents: h.regularRateCents,
              overtimeMultiplier: ratio,
              expectedGrossCents: null,
              expectedNetCents: null,
              payday: p.statement.payDate
                ? new Date(p.statement.payDate + 'T12:00:00Z').getUTCDay()
                : null,
              status: 'active',
              notes:
                'Created from a reviewed paycheck. Future income and unconfigured overtime rules are not assumed.',
            }),
          }).id
        }
        if (!sourceId) throw new FinancialError('Select a payroll source', 400)
        const source = access.source(user, home, sourceId, true)
        if (source.isArchived || source.status !== 'active')
          throw new FinancialError('Restore this income source before importing', 409)
        if (!p.newSource && !(sourceId in receipt.profiles))
          throw new FinancialError('Source changed. Upload again.', 409)
        let profile = store.profiles(home).find((v) => v.sourceId === sourceId)
        if (!p.newSource && (profile?.revision ?? 0) !== receipt.profiles[sourceId])
          throw new FinancialError('Payroll settings changed. Upload again.', 409)
        if (!profile) {
          if (p.profile && p.profile.sourceId !== sourceId)
            throw new FinancialError('Payroll profile source does not match', 400)
          const initial =
            p.profile ??
            automaticPayrollProfile(
              sourceId,
              p.statement,
              candidateFrequency ?? source.frequency,
              p.semiMonthlySplitDay ?? 15,
              source.name,
            )
          profile = store.profile(home, sourceId, JSON.stringify(initial), 0)
          store.audit(home, sourceId, null, user.id, 'profile_saved', null, {
            profile,
            reason: 'Confirmed during paycheck import',
          })
        }
        const v = p.statement
        if (!v.periodStart || !v.periodEnd || !v.payDate)
          throw new FinancialError('Confirm the missing pay period and statement date', 400)
        const existing = store
          .weeks(home)
          .find((w) => w.sourceId === sourceId && w.workweekStart === v.periodStart)
        const periodProfile = existing
          ? payrollProfileSchema.parse(
              JSON.parse(store.rawWeek(home, existing.id)!.profileSnapshotJson),
            )
          : profile
        const frequency =
            existing?.payFrequency ??
            (existing
              ? 'weekly'
              : (p.payFrequency ?? v.payFrequency ?? profile.payFrequency ?? source.frequency)),
          split =
            existing?.semiMonthlySplitDay ??
            p.semiMonthlySplitDay ??
            periodProfile.semiMonthlySplitDay ??
            15,
          issue = payrollPeriodIssue(
            v.periodStart,
            v.periodEnd,
            frequency,
            split,
            existing?.periodAnchor ?? periodProfile.periodAnchor,
          )
        if (issue) throw new FinancialError(issue, 400)
        if (existing && p.payFrequency && p.payFrequency !== frequency)
          throw new FinancialError(
            'Keep the existing paycheck schedule when correcting this period.',
            409,
          )
        if (
          ['weekly', 'biweekly'].includes(frequency) &&
          new Date(v.periodStart + 'T12:00:00Z').getUTCDay() !== periodProfile.workweekStartDay
        )
          throw new FinancialError(
            'Pay period starts on a different weekday than the source schedule. Correct the dates or payroll settings.',
            400,
          )
        if (
          !existing &&
          store
            .weeks(home)
            .some(
              (w) =>
                w.sourceId === sourceId &&
                w.workweekStart <= v.periodEnd! &&
                w.workweekEnd >= v.periodStart!,
            )
        )
          throw new FinancialError(
            'This period overlaps an existing paycheck. Review the existing record before importing another.',
            409,
          )
        const snapshot = {
          ...payrollProfileSchema.strip().parse(profile),
          payFrequency: frequency,
          semiMonthlySplitDay: split,
        }
        if (
          existing &&
          (existing.workweekEnd !== v.periodEnd || receipt.weeks[existing.id] !== existing.revision)
        )
          throw new FinancialError(
            'Payroll week changed or already exists since this preview. Upload again.',
            409,
          )
        if (store.digest(home, receipt.digest))
          throw new FinancialError(
            'This document is already saved; correct the existing paycheck',
            409,
          )
        const receivedAt =
          store
            .history(home, sourceId)
            .filter(
              (a) =>
                a.action === 'upload_preview_received' &&
                JSON.parse(a.afterJson).digest === receipt.digest,
            )
            .map((a) => JSON.parse(a.afterJson).receivedAt as string)
            .sort()[0] ??
          store.uploadReceipt(home, user.id, receipt.digest)?.receivedAt ??
          receipt.receivedAt
        const now = new Date().toISOString(),
          id = existing?.id ?? randomUUID()
        if (!existing) {
          const values = weeklyHoursSchema.parse({
            ...payrollImportedHours(
              v,
              sourceId,
              v.payDate,
              frequency,
              split,
              profile.periodAnchor ?? null,
            ),
            expectedDepositBasis: 'statement',
          })
          store.insertWeek({
            id,
            householdId: home,
            sourceId: sourceId,
            workweekStart: v.periodStart,
            workweekEnd: v.periodEnd,
            hoursJson: JSON.stringify(values),
            profileSnapshotJson: JSON.stringify(snapshot),
            stage: 'paystub_received',
            statementReceivedAt: receivedAt,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: p.idempotencyKey,
            createdByUserId: user.id,
          })
          store.audit(home, sourceId, id, user.id, 'paystub_received', null, {
            receivedAt,
            origin: 'upload_first',
          })
        }
        const result = reviewPayroll(
          store,
          income,
          {
            source: access.source,
            week: (_u, _h, weekId, revision) => {
              const w = store.weeks(home).find((w) => w.id === weekId)!
              if (w.revision !== revision)
                throw new FinancialError('Payroll changed. Upload again.', 409)
              return w
            },
            view: () => access.list(user, home).weeks.find((w) => w.id === id)!,
          },
          user,
          home,
          id,
          {
            statement: { ...v, payFrequency: frequency },
            documentDigest: receipt.digest,
            revision: existing?.revision ?? 1,
            reason: p.reason,
          },
          { receivedAt, sourceConfirmed: true },
        )
        store.audit(home, sourceId, id, user.id, 'upload_import_saved', null, {
          idempotencyKey: p.idempotencyKey,
          hash,
          reason: p.reason,
        })
        return result
      })
    },
  }
}
