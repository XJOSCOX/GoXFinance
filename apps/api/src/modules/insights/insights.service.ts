import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import {
  financialInsights,
  insightInteractionSchema,
  smartForecastInput,
  smartPlanner,
  forecast,
  spendingEvidence,
  localBillDate,
  type Insight,
  type InsightPlan,
  type InsightSources,
  type InsightsData,
  type ForecastSettingsVersion,
  type ForecastInput,
  type PublicUser,
} from '@goxfinance/shared'
import type { FinancialAccess } from '../households/financial-access'
import { FinancialError } from '../households/financial-access'
import { authorizedInsightRef, scopedInsights } from './insights.permissions'
import type { InsightsRepository } from './insights.repository'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const request = z
  .object({
    idempotencyKey: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative(),
    values: insightInteractionSchema,
  })
  .strict()
type Snapshot = {
  insight: Insight
  scenario: InsightPlan['scenario']
  scopeRefs: Insight['refs']
  ownerOnly: boolean
}
export function insightsService(
  store: InsightsRepository,
  access: FinancialAccess,
  sources: (u: PublicUser, h: string) => InsightSources,
  settings: (h: string) => ForecastSettingsVersion[],
) {
  function context(user: PublicUser, home: string) {
    const ctx = access.context(user, home),
      s = scopedInsights(access, user, home, sources(user, home)),
      today = localBillDate(),
      now = new Date().toISOString()
    // Manual household opening balances and household reserves are Owner controlled.
    const history = ctx.role === 'owner' ? settings(home) : [],
      preferences = history[0] ?? null,
      input = smartForecastInput(preferences, today, 90)
    s.settingsIds = history.map((v) => v.id)
    s.settingsId = preferences?.id
    const fingerprint = hash({ s, input, date: today }),
      plan = smartPlanner(s, input, today),
      report = financialInsights(s, input, now, today, plan)
    report.insights = report.insights.filter((i) => i.refs.every((r) => authorizedInsightRef(r, s)))
    return { ctx, s, today, input, fingerprint, report, plan, now }
  }
  function simulate(
    c: ReturnType<typeof context>,
    i: Insight,
    v: Extract<z.infer<typeof insightInteractionSchema>, { kind: 'plan' }>,
  ): InsightPlan['scenario'] {
    if (v.reductionCents === null) return null
    const max = i.reducibleCents
    if (
      max === undefined ||
      v.reductionCents <= 0 ||
      v.reductionCents > max ||
      v.startDate !== c.today ||
      v.endDate < c.today ||
      v.endDate.slice(0, 7) !== c.today.slice(0, 7)
    )
      throw new FinancialError(
        'Choose a positive reduction within the current category allowance, starting today and ending this month.',
        400,
      )
    const input: ForecastInput = { ...c.input, endDate: v.endDate, variableSpendingCents: max },
      before = forecast(c.s, input, c.today),
      after = forecast(c.s, { ...input, variableSpendingCents: max - v.reductionCents }, c.today)
    return {
      input,
      baseline: {
        endingCents: before.endingCents,
        lowestCents: before.lowestCents,
        incomplete: before.incomplete,
      },
      proposed: {
        endingCents: after.endingCents,
        lowestCents: after.lowestCents,
        incomplete: after.incomplete,
      },
      improvementCents:
        !before.incomplete &&
        !after.incomplete &&
        before.lowestCents !== null &&
        after.lowestCents !== null
          ? after.lowestCents - before.lowestCents
          : null,
    }
  }
  return {
    command(user: PublicUser, home: string) {
      const c = context(user, home)
      for (const row of store.records(home, user.id)) {
        const values = insightInteractionSchema.parse(JSON.parse(row.valuesJson)),
          saved = JSON.parse(row.snapshotJson) as Snapshot
        if (
          values.kind !== 'feedback' ||
          (saved.ownerOnly && c.ctx.role !== 'owner') ||
          !saved.scopeRefs.every((ref) => authorizedInsightRef(ref, c.s))
        )
          continue
        const i = c.report.insights.find((i) => i.id === values.insightId)
        if (i && values.status !== 'reset') i.feedback = values.status
      }
      c.report.insights = c.report.insights.filter(
        (i) => i.feedback !== 'dismissed' || ['urgent', 'important'].includes(i.priority),
      )
      return c
    },
    list(user: PublicUser, home: string): InsightsData {
      const c = context(user, home),
        rows = store.records(home, user.id),
        plans: InsightPlan[] = []
      for (const r of rows) {
        const values = insightInteractionSchema.parse(JSON.parse(r.valuesJson)),
          saved = JSON.parse(r.snapshotJson) as Snapshot
        if (saved.ownerOnly && c.ctx.role !== 'owner') continue
        if (!saved.scopeRefs.every((ref) => authorizedInsightRef(ref, c.s))) continue
        if (values.kind === 'feedback') {
          const i = c.report.insights.find((i) => i.id === values.insightId)
          if (i) {
            i.feedbackRevision = r.revision
            if (values.status !== 'reset') i.feedback = values.status
          }
        } else {
          const futureSources = {
            ...c.s,
            expenses: c.s.expenses.filter(
              (e) => e.transactionDate > r.createdAt.slice(0, 10) || e.createdAt > r.createdAt,
            ),
            bills: c.s.bills.map((b) => ({
              ...b,
              payments: b.payments.filter(
                (p) => p.paymentDate > r.createdAt.slice(0, 10) || p.createdAt > r.createdAt,
              ),
            })),
            refunds: c.s.refunds?.filter((r2) => r2.date > r.createdAt.slice(0, 10)),
          }
          const actual = saved.insight.categoryId
            ? spendingEvidence(
                futureSources,
                values.startDate,
                values.endDate < c.today ? values.endDate : c.today,
                saved.insight.categoryId,
              )
            : { cents: null, count: 0 }
          plans.push({
            id: r.id,
            revision: r.revision,
            values,
            insight: saved.insight,
            createdAt: r.createdAt,
            stale: r.fingerprint !== c.fingerprint,
            observedSpendingCents: actual.cents,
            observedCount: actual.count,
            achievedSavingsCents: null,
            scenario: saved.scenario,
          })
        }
      }
      // Dismissal is a presentation preference; verified/significant risks remain visible.
      c.report.insights = c.report.insights.filter(
        (i) => i.feedback !== 'dismissed' || ['urgent', 'important'].includes(i.priority),
      )
      return {
        report: c.report,
        fingerprint: c.fingerprint,
        canManage: c.ctx.role !== 'viewer',
        plans,
      }
    },
    preview(user: PublicUser, home: string, body: unknown) {
      const p = request.parse(body),
        c = context(user, home)
      if (p.fingerprint !== c.fingerprint)
        throw new FinancialError('Sources changed. Refresh insights.', 409)
      const i = c.report.insights.find((i) => i.id === p.values.insightId)
      if (!i) throw new FinancialError('Insight no longer available', 404)
      if (p.values.kind !== 'plan') throw new FinancialError('Choose an action plan', 400)
      return { scenario: simulate(c, i, p.values) }
    },
    save(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const p = request.parse(body),
          c = context(user, home)
        if (c.ctx.role === 'viewer') throw new FinancialError('Read-only access', 403)
        const digest = hash(p),
          replay = store.audit(home, user.id).find((a) => a.idempotencyKey === p.idempotencyKey)
        if (replay) {
          if (replay.digest !== digest)
            throw new FinancialError(
              'Idempotency key was already used for a different request',
              409,
            )
          return { id: replay.targetId }
        }
        if (p.fingerprint !== c.fingerprint)
          throw new FinancialError('Sources changed. Refresh insights before accepting.', 409)
        const old = store
          .records(home, user.id)
          .find((r) => r.insightId === p.values.insightId && r.kind === p.values.kind)
        if ((old?.revision ?? 0) !== p.revision)
          throw new FinancialError('This action was changed. Refresh before editing.', 409)
        const prior = old ? (JSON.parse(old.snapshotJson) as Snapshot) : null
        if (prior?.ownerOnly && c.ctx.role !== 'owner')
          throw new FinancialError('Source access changed', 404)
        if (prior && !prior.scopeRefs.every((ref) => authorizedInsightRef(ref, c.s)))
          throw new FinancialError('Source access changed', 404)
        const i =
          c.report.insights.find((i) => i.id === p.values.insightId) ??
          (p.values.kind === 'plan' ? prior?.insight : null)
        if (!i) throw new FinancialError('Insight no longer available', 404)
        if (
          p.values.kind === 'plan' &&
          (p.values.endDate < p.values.startDate ||
            p.values.endDate.slice(0, 7) !== p.values.startDate.slice(0, 7))
        )
          throw new FinancialError('Choose dates within one calendar month.', 400)
        // Status edits retain original evidence/scenario; they cannot silently rewrite accepted assumptions.
        if (old && p.values.kind === 'plan') {
          const previous = insightInteractionSchema.parse(JSON.parse(old.valuesJson))
          if (
            previous.kind === 'plan' &&
            (previous.startDate !== p.values.startDate ||
              previous.endDate !== p.values.endDate ||
              previous.reductionCents !== p.values.reductionCents)
          )
            throw new FinancialError(
              'Accepted plan assumptions are immutable; review a fresh recommendation instead.',
              409,
            )
        }
        const scenario =
          p.values.kind === 'plan' && !old ? simulate(c, i, p.values) : (prior?.scenario ?? null)
        const snapshot: Snapshot = prior ?? {
          ownerOnly: c.ctx.role === 'owner',
          insight: i,
          scenario,
          scopeRefs: [
            ...c.report.metrics.flatMap((m) => m.refs),
            ...c.report.insights.flatMap((i) => i.refs),
          ],
        }
        const id = old?.id ?? randomUUID(),
          row = {
            id,
            householdId: home,
            actorUserId: user.id,
            insightId: i.id,
            kind: p.values.kind,
            revision: (old?.revision ?? 0) + 1,
            valuesJson: JSON.stringify(p.values),
            snapshotJson: JSON.stringify(snapshot),
            fingerprint: old?.fingerprint ?? c.fingerprint,
            createdAt: old?.createdAt ?? c.now,
            updatedAt: c.now,
          }
        store.write(row)
        store.recordAudit({
          id: randomUUID(),
          householdId: home,
          actorUserId: user.id,
          targetId: id,
          idempotencyKey: p.idempotencyKey,
          digest,
          detailsJson: JSON.stringify({ before: old ?? null, after: row }),
          createdAt: c.now,
        })
        return { id }
      })
    },
    history(user: PublicUser, home: string, id: string) {
      const c = context(user, home),
        r = store.records(home, user.id).find((r) => r.id === id)
      if (
        !r ||
        ((JSON.parse(r.snapshotJson) as Snapshot).ownerOnly && c.ctx.role !== 'owner') ||
        (JSON.parse(r.snapshotJson) as Snapshot).scopeRefs.some(
          (ref) => !authorizedInsightRef(ref, c.s),
        )
      )
        throw new FinancialError('Action plan not found', 404)
      return {
        history: store
          .audit(home, user.id)
          .filter((a) => a.targetId === id)
          .map((a) => ({ id: a.id, createdAt: a.createdAt, details: JSON.parse(a.detailsJson) }))
          .sort((a, b) => a.details.after.revision - b.details.after.revision),
      }
    },
  }
}
export type InsightsService = ReturnType<typeof insightsService>
