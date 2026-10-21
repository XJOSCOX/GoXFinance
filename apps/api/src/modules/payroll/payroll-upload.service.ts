import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  payrollProfileSchema,
  payrollStatementSchema,
  payrollImportedHours,
  payrollMilestones,
  weeklyHoursSchema,
  type PublicUser,
  type PayrollUploadPreview,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import type { PayrollData, IncomeSource } from '@goxfinance/shared'
import type { IncomeService } from '../income/income.service'
import { FinancialError } from '../households/financial-access'
import { reviewPayroll } from './payroll-review'
import { localDocumentPreview } from './documents/document.service'
import { readUploadReceipt, signUploadReceipt } from './payroll-upload-receipt'
import { matchPayrollSources } from './payroll-source-matching'
export function payrollUploadService(
  store: PayrollRepository,
  income: IncomeService,
  access: {
    source: (user: PublicUser, home: string, id: string, write?: boolean) => IncomeSource
    list: (user: PublicUser, home: string) => PayrollData
  },
) {
  function sources(user: PublicUser, home: string) {
    const data = access.list(user, home)
    const allowed = income
      .list(user, home)
      .sources.filter(
        (s) =>
          s.canManage &&
          !s.isArchived &&
          s.status === 'active' &&
          s.incomeType !== 'trading_payout',
      )
      .filter((s) => {
        try {
          access.source(user, home, s.id, true)
          return true
        } catch {
          return false
        }
      })
    if (!allowed.length)
      throw new FinancialError(
        'Add an authorized employment income source before uploading a paycheck',
        403,
      )
    return allowed.map((s) => ({
      id: s.id,
      name: s.name,
      profile: data.profiles.find((p) => p.sourceId === s.id) ?? null,
    }))
  }
  return {
    async preview(user: PublicUser, home: string, body: unknown): Promise<PayrollUploadPreview> {
      const available = sources(user, home),
        data = access.list(user, home),
        receivedAt = new Date().toISOString(),
        weeks = Object.fromEntries(data.weeks.map((w) => [w.id, w.revision])),
        profiles = Object.fromEntries(available.map((s) => [s.id, s.profile?.revision ?? 0])),
        extracted = await localDocumentPreview(user.id, body),
        duplicate = store.digest(home, extracted.documentDigest)
      if (duplicate) {
        access.source(user, home, duplicate.sourceId, true)
        throw new FinancialError(
          'This document is already saved. Open its existing paycheck to make a correction.',
          409,
        )
      }
      const matches = matchPayrollSources(extracted.statement, available, store.aliases(home))
      // A fingerprint receipt survives cancelled previews without retaining documents.
      store.atomic(() => {
        for (const candidate of available) {
          access.source(user, home, candidate.id, true)
          if (
            !store
              .history(home, candidate.id)
              .some(
                (a) =>
                  a.action === 'upload_preview_received' &&
                  JSON.parse(a.afterJson).digest === extracted.documentDigest,
              )
          )
            store.audit(home, candidate.id, null, user.id, 'upload_preview_received', null, {
              digest: extracted.documentDigest,
              receivedAt,
            })
        }
      })
      return {
        ...extracted,
        sources: available.map((s) => {
          const w = data.weeks.find(
            (w) =>
              w.sourceId === s.id &&
              w.workweekStart === extracted.statement.periodStart &&
              w.workweekEnd === extracted.statement.periodEnd,
          )
          return { ...s, existingWeek: w ? { id: w.id, stage: w.stage } : undefined }
        }),
        matchedSourceId: matches.length === 1 ? matches[0] : null,
        receivedAt,
        receipt: signUploadReceipt({
          home,
          actor: user.id,
          digest: extracted.documentDigest,
          receivedAt,
          weeks,
          profiles,
        }),
      }
    },
    save(user: PublicUser, home: string, body: unknown) {
      const p = z
        .object({
          receipt: z.string().max(256000),
          sourceId: z.uuid(),
          statement: payrollStatementSchema,
          idempotencyKey: z.uuid(),
          profile: payrollProfileSchema.optional(),
          reason: z.string().trim().min(1).max(2000).default('Reviewed uploaded paycheck'),
        })
        .strict()
        .parse(body)
      const receipt = readUploadReceipt(p.receipt, home, user.id),
        hash = createHash('sha256').update(JSON.stringify(p)).digest('hex')
      return store.atomic(() => {
        const source = access.source(user, home, p.sourceId, true)
        if (source.isArchived || source.status !== 'active')
          throw new FinancialError('Restore this income source before importing', 409)
        const replay = store.importReplay(home, p.idempotencyKey)
        if (replay) {
          const previous = JSON.parse(replay.afterJson)
          if (
            previous.hash !== hash ||
            replay.actorUserId !== user.id ||
            replay.sourceId !== p.sourceId
          )
            throw new FinancialError('Submission key already used', 409)
          return access.list(user, home).weeks.find((w) => w.id === replay.weekId)!
        }
        if (!(p.sourceId in receipt.profiles))
          throw new FinancialError('Source changed. Upload again.', 409)
        let profile = store.profiles(home).find((v) => v.sourceId === p.sourceId)
        if ((profile?.revision ?? 0) !== receipt.profiles[p.sourceId])
          throw new FinancialError('Payroll settings changed. Upload again.', 409)
        if (!profile) {
          if (!p.profile || p.profile.sourceId !== p.sourceId)
            throw new FinancialError('Confirm payroll settings for this source', 400)
          profile = store.profile(home, p.sourceId, JSON.stringify(p.profile), 0)
          store.audit(home, p.sourceId, null, user.id, 'profile_saved', null, {
            profile,
            reason: 'Confirmed during paycheck import',
          })
        }
        const v = p.statement
        if (!v.periodStart || !v.periodEnd || !v.payDate)
          throw new FinancialError('Confirm the missing pay period and statement date', 400)
        if (new Date(v.periodStart + 'T12:00:00Z').getUTCDay() !== profile.workweekStartDay)
          throw new FinancialError(
            'Pay period begins on a different weekday than this payroll profile. Correct the period or source settings.',
            400,
          )
        const existing = store
          .weeks(home)
          .find((w) => w.sourceId === p.sourceId && w.workweekStart === v.periodStart)
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
            .history(home, p.sourceId)
            .filter(
              (a) =>
                a.action === 'upload_preview_received' &&
                JSON.parse(a.afterJson).digest === receipt.digest,
            )
            .map((a) => JSON.parse(a.afterJson).receivedAt as string)
            .sort()[0] ?? receipt.receivedAt
        const now = new Date().toISOString(),
          id = existing?.id ?? randomUUID()
        if (!existing) {
          const values = weeklyHoursSchema.parse(
            payrollImportedHours(v, p.sourceId, payrollMilestones(v.periodEnd, profile).deposit),
          )
          store.insertWeek({
            id,
            householdId: home,
            sourceId: p.sourceId,
            workweekStart: v.periodStart,
            workweekEnd: v.periodEnd,
            hoursJson: JSON.stringify(values),
            profileSnapshotJson: JSON.stringify(payrollProfileSchema.strip().parse(profile)),
            stage: 'paystub_received',
            statementReceivedAt: receivedAt,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: p.idempotencyKey,
            createdByUserId: user.id,
          })
          store.audit(home, p.sourceId, id, user.id, 'paystub_received', null, {
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
            statement: v,
            documentDigest: receipt.digest,
            revision: existing?.revision ?? 1,
            reason: p.reason,
          },
          { receivedAt, sourceConfirmed: true },
        )
        store.audit(home, p.sourceId, id, user.id, 'upload_import_saved', null, {
          idempotencyKey: p.idempotencyKey,
          hash,
          reason: p.reason,
        })
        return result
      })
    },
  }
}
