import { reviewPayroll } from './payroll-review'
import { payrollUploadService } from './payroll-upload.service'
import { recordPayrollForecast } from './payroll-forecast'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  payrollProfileSchema,
  weeklyHoursSchema,
  type PublicUser,
  type PayrollWeek,
} from '@goxfinance/shared'
import type { IncomeService } from '../income/income.service'
import type { IncomePermissions } from '../income/income.permissions'
import type { PayrollRepository } from './payroll.repository'
import { FinancialError } from '../households/financial-access'
const change = z.object({
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(2000),
})
const stale = (a: number, b: number) => {
  if (a !== b) throw new FinancialError('Payroll record changed. Refresh before saving.', 409)
}
export function payrollService(
  store: PayrollRepository,
  income: IncomeService,
  permissions: IncomePermissions,
) {
  function source(user: PublicUser, home: string, id: string, write = false) {
    const ctx = permissions.context(user, home),
      s = income.list(user, home).sources.find((s) => s.id === id)
    if (!s) throw new FinancialError('Income source not found', 404)
    if (ctx.role !== 'owner' && s.responsibleMemberId !== ctx.self?.id)
      throw new FinancialError('This payroll source is private to its earner and the Owner', 403)
    if (write) permissions.manage(user, home, s.responsibleMemberId, true)
    if (s.incomeType === 'trading_payout')
      throw new FinancialError('Payroll cannot import trading payouts', 400)
    return s
  }
  function week(user: PublicUser, home: string, id: string, revision?: number) {
    const w = store.weeks(home).find((w) => w.id === id)
    if (!w) throw new FinancialError('Payroll week not found', 404)
    source(user, home, w.sourceId, true)
    if (revision !== undefined) stale(w.revision, revision)
    return w
  }
  function view(user: PublicUser, home: string, w: PayrollWeek) {
    const s = source(user, home, w.sourceId)
    return { ...w, canManage: permissions.canManage(user, home, s.responsibleMemberId) }
  }
  const actions = {
    source,
    list(user: PublicUser, home: string) {
      const ctx = permissions.context(user, home),
        ids = new Set(
          income
            .list(user, home)
            .sources.filter((s) => ctx.role === 'owner' || s.responsibleMemberId === ctx.self?.id)
            .map((s) => s.id),
        )
      return {
        profiles: store.profiles(home).filter((p) => ids.has(p.sourceId)),
        weeks: store
          .weeks(home)
          .filter((w) => ids.has(w.sourceId))
          .map((w) => view(user, home, w)),
        canManage: ctx.role !== 'viewer',
      }
    },
    profile(user: PublicUser, home: string, body: unknown) {
      const p = z
        .object({ values: payrollProfileSchema, ...change.shape })
        .strict()
        .parse(body)
      return store.atomic(() => {
        const s = source(user, home, p.values.sourceId, true)
        if (s.isArchived) throw new FinancialError('Restore this source first', 409)
        const old = store.profiles(home).find((v) => v.sourceId === s.id)
        stale(old?.revision ?? 0, p.revision)
        const saved = store.profile(home, s.id, JSON.stringify(p.values), p.revision)
        store.audit(home, s.id, null, user.id, 'profile_saved', old, { saved, reason: p.reason })
        return saved
      })
    },
    hours(user: PublicUser, home: string, body: unknown, id?: string) {
      const p = z
        .object({
          values: weeklyHoursSchema,
          idempotencyKey: z.uuid(),
          submit: z.boolean(),
          ...change.shape,
        })
        .strict()
        .parse(body)
      if (p.values.documentOnly)
        throw new FinancialError('Upload documented hours through paycheck review', 400)
      return store.atomic(() => {
        source(user, home, p.values.sourceId, true)
        const old = id ? week(user, home, id, p.revision) : undefined
        const replay = store
          .weeks(home)
          .find((w) => store.rawWeek(home, w.id)?.idempotencyKey === p.idempotencyKey)
        if (!id && replay) {
          if (JSON.stringify(weeklyHoursSchema.strip().parse(replay)) !== JSON.stringify(p.values))
            throw new FinancialError('Submission key already used', 409)
          return view(user, home, replay)
        }
        if (old && old.sourceId !== p.values.sourceId)
          throw new FinancialError('Cannot move a payroll week to another source', 400)
        if (old?.statementReceivedAt)
          throw new FinancialError(
            'Hours are locked after a document arrives; correct the reviewed statement instead.',
            409,
          )
        if (
          !old &&
          store
            .weeks(home)
            .some(
              (w) => w.sourceId === p.values.sourceId && w.workweekStart === p.values.workweekStart,
            )
        )
          throw new FinancialError('This workweek already exists. Edit it instead.', 409)
        const profile = store.profiles(home).find((v) => v.sourceId === p.values.sourceId)
        if (!profile) throw new FinancialError('Save payroll settings before reporting hours', 400)
        const now = new Date().toISOString(),
          weekId = old?.id ?? randomUUID(),
          stage = p.submit ? 'hours_submitted' : 'hours_draft'
        if (old)
          store.patch(home, weekId, {
            hoursJson: JSON.stringify(p.values),
            workweekStart: p.values.workweekStart,
            workweekEnd: p.values.workweekEnd,
            profileSnapshotJson: JSON.stringify(payrollProfileSchema.strip().parse(profile)),
            stage,
            revision: old.revision + 1,
            updatedAt: now,
          })
        else
          store.insertWeek({
            id: weekId,
            householdId: home,
            sourceId: p.values.sourceId,
            workweekStart: p.values.workweekStart,
            workweekEnd: p.values.workweekEnd,
            hoursJson: JSON.stringify(p.values),
            profileSnapshotJson: JSON.stringify(payrollProfileSchema.strip().parse(profile)),
            stage,
            createdAt: now,
            updatedAt: now,
            idempotencyKey: p.idempotencyKey,
            createdByUserId: user.id,
          })
        const saved = store.weeks(home).find((w) => w.id === weekId)!
        recordPayrollForecast(store, home, saved)
        store.audit(
          home,
          saved.sourceId,
          weekId,
          user.id,
          p.submit ? 'hours_submitted' : 'hours_draft_saved',
          old,
          { hours: p.values, reason: p.reason },
        )
        return view(
          user,
          home,
          store.weeks(home).find((w) => w.id === weekId)!,
        )
      })
    },
    pending(user: PublicUser, home: string, id: string, revision: number) {
      return store.atomic(() => {
        const w = week(user, home, id, revision)
        if (w.stage !== 'hours_submitted')
          throw new FinancialError('Submit hours before payroll processing', 409)
        store.patch(home, id, {
          stage: 'payroll_pending',
          revision: w.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        store.audit(home, w.sourceId, id, user.id, 'payroll_pending', null, { revision })
        return view(
          user,
          home,
          store.weeks(home).find((w) => w.id === id)!,
        )
      })
    },
    received(user: PublicUser, home: string, id: string, revision: number) {
      return store.atomic(() => {
        const w = week(user, home, id, revision)
        if (w.stage === 'deposit_confirmed')
          throw new FinancialError('Correct a reviewed paycheck through payroll review', 409)
        const now = new Date().toISOString()
        store.patch(home, id, {
          statementReceivedAt: w.statementReceivedAt ?? now,
          stage: 'paystub_received',
          revision: w.revision + 1,
          updatedAt: now,
        })
        store.audit(home, w.sourceId, id, user.id, 'paystub_received', null, { revision })
        return view(
          user,
          home,
          store.weeks(home).find((w) => w.id === id)!,
        )
      })
    },
    review(user: PublicUser, home: string, id: string, body: unknown) {
      return reviewPayroll(store, income, { source, week, view }, user, home, id, body)
    },
    history(user: PublicUser, home: string, id: string) {
      source(user, home, id)
      return store.history(home, id)
    },
  }
  const upload = payrollUploadService(store, income, actions)
  return { ...actions, uploadPreview: upload.preview, uploadSave: upload.save }
}
export type PayrollService = ReturnType<typeof payrollService>
