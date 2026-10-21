import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  plannerInputSchema,
  forecastInputSchema,
  smartForecastInput,
  smartPlanner,
  localBillDate,
  type PlannerRecord,
  type PublicUser,
  type ForecastSources,
} from '@goxfinance/shared'
import type { PlannerRepository } from './planner.repository'
import type { PlannerPermissions } from './planner.permissions'
import type { ForecastRepository } from '../forecasts/forecast.repository'
import { visibleForecastSettings, validateOpeningCash } from '../forecasts/forecast-settings'
import type { bankService } from '../banking/bank.service'
import { FinancialError } from '../households/financial-access'
import { validatePlanner } from './planner.validation'
const submission = z
  .object({
    values: plannerInputSchema,
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(1).max(2000),
    idempotencyKey: z.uuid(),
  })
  .strict()
const reviewInput = z
  .object({
    decision: z.enum(['approved', 'rejected', 'cancelled']),
    reason: z.string().trim().min(1).max(2000),
    idempotencyKey: z.uuid(),
  })
  .strict()
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export function plannerService(
  store: PlannerRepository,
  access: PlannerPermissions,
  forecasts: ForecastRepository,
  sources: (user: PublicUser, home: string) => ForecastSources,
  banks: ReturnType<typeof bankService>,
) {
  const fingerprint = (s: ForecastSources, home: string) =>
    hash({ data: s, settings: forecasts.settings(home)[0]?.id ?? null })
  const ownerHash = (user: PublicUser, home: string) =>
    fingerprint(
      sources({ ...user, id: access.context(user, home).home.createdByUserId }, home),
      home,
    )
  function replay(user: PublicUser, home: string, key: string, body: unknown) {
    const r = store.auditRows(home).find((a) => a.idempotencyKey === key)
    if (!r) return null
    if (r.actorUserId !== user.id || r.digest !== hash(body))
      throw new FinancialError('Submission key already used', 409)
    return JSON.parse(r.resultJson) as {
      record?: PlannerRecord
      request?: unknown
      snapshot?: unknown
    }
  }
  function audit(
    user: PublicUser,
    home: string,
    target: string,
    action: string,
    body: { idempotencyKey: string },
    details: unknown,
    result: unknown,
  ) {
    store.audit(home, user.id, target, action, details, body.idempotencyKey, hash(body), result)
  }
  function flags(user: PublicUser, home: string, record: PlannerRecord, data: ForecastSources) {
    try {
      return { ...record, canManage: true, ...access.manage(user, home, record.values, data) }
    } catch {
      return { ...record, canManage: false, requiresApproval: false }
    }
  }
  function canSnapshot(_user: PublicUser, _home: string, json: string, data: ForecastSources) {
    const old = JSON.parse(json) as ForecastSources
    return (
      (old.planner?.goals ?? []).every((g) => data.planner?.goals?.some((n) => n.id === g.id)) &&
      old.income.sources.every((i) => data.income.sources.some((n) => n.id === i.id)) &&
      (old.cashAccounts ?? []).every((a) => data.cashAccounts?.some((n) => n.id === a.id)) &&
      (old.planner?.records ?? []).every((r) => access.visible(r.values, data))
    )
  }
  return {
    list(user: PublicUser, home: string) {
      const ctx = access.context(user, home),
        data = sources(user, home)
      return {
        sources: data,
        fingerprint: fingerprint(data, home),
        settings: visibleForecastSettings(forecasts.settings(home)[0] ?? null, data),
        canManage: ctx.role !== 'viewer',
        owner: ctx.role === 'owner',
        records: (data.planner?.records ?? []).map((r) => flags(user, home, r, data)),
        requests: store
          .requests(home)
          .filter(
            (r) =>
              (ctx.role === 'owner' || r.actorUserId === user.id) && access.visible(r.values, data),
          ),
        snapshots: store
          .snapshots(home)
          .filter(
            (r) =>
              ctx.role === 'owner' ||
              (r.actorUserId === user.id && canSnapshot(user, home, r.sourcesJson, data)),
          )
          .map(({ id, name, report, inputJson, createdAt }) => ({
            id,
            name,
            report,
            input: forecastInputSchema.parse(JSON.parse(inputJson)),
            createdAt,
          })),
      }
    },
    save(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        access.context(user, home)
        const p = submission.parse(body),
          data = sources(user, home),
          old = id ? store.records(home).find((r) => r.id === id) : undefined
        if (id && !old) throw new FinancialError('Planning record not found', 404)
        if (old) access.manage(user, home, old.values, data)
        const permission = access.manage(user, home, p.values, data),
          again = replay(user, home, p.idempotencyKey, { ...p, id })
        if (again) return again
        if (fingerprint(data, home) !== p.fingerprint || (old?.revision ?? 0) !== p.revision)
          throw new FinancialError(
            'Financial records or planning settings changed. Refresh before saving.',
            409,
          )
        if (p.values.kind === 'allocation' && p.values.fundingEventId) {
          const input = smartForecastInput(
              visibleForecastSettings(forecasts.settings(home)[0] ?? null, data),
              localBillDate(),
              90,
            ),
            known = smartPlanner(data, input, localBillDate()).funding
          const fundingId = p.values.fundingEventId
          if (!known.some((f) => f.id === fundingId))
            throw new FinancialError(
              'Selected funding source is unavailable or no longer current. Refresh the plan.',
              409,
            )
        }
        validatePlanner(p.values, data, store.records(home), localBillDate(), id)
        if (permission.requiresApproval) {
          if (
            store
              .requests(home)
              .some(
                (r) =>
                  r.status === 'pending' &&
                  r.actorUserId === user.id &&
                  r.targetId === (id ?? null) &&
                  JSON.stringify(r.values) === JSON.stringify(p.values),
              )
          )
            throw new FinancialError('An identical request is already pending.', 409)
          const request = store.request(
              home,
              user.id,
              id ?? null,
              p.revision,
              p.values,
              ownerHash(user, home),
              p.reason,
            ),
            result = { request }
          audit(
            user,
            home,
            request.id,
            'request_submitted',
            { ...p, id } as typeof p,
            { values: p.values, reason: p.reason },
            result,
          )
          return result
        }
        const record = store.write(home, user.id, p.values, id),
          result = { record }
        audit(
          user,
          home,
          record.id,
          old ? 'record_updated' : 'record_created',
          { ...p, id } as typeof p,
          { before: old?.values ?? null, after: p.values, reason: p.reason },
          result,
        )
        return result
      })
    },
    review(user: PublicUser, home: string, id: string, body: unknown) {
      return store.atomic(() => {
        const ctx = access.context(user, home),
          p = reviewInput.parse(body),
          request = store.requests(home).find((r) => r.id === id),
          data = sources(user, home)
        if (!request || !access.visible(request.values, data))
          throw new FinancialError('Request not found', 404)
        if (
          p.decision === 'cancelled'
            ? request.actorUserId !== user.id
            : ctx.role !== 'owner' || request.actorUserId === user.id
        )
          throw new FinancialError('Only the Owner may review another member’s request.', 403)
        const again = replay(user, home, p.idempotencyKey, { ...p, id })
        if (again) return again
        if (request.status !== 'pending') throw new FinancialError('Request already reviewed', 409)
        let record: PlannerRecord | undefined
        if (p.decision === 'approved') {
          const old = store.records(home).find((r) => r.id === request.targetId)
          if (
            (old?.revision ?? 0) !== request.revision ||
            ownerHash(user, home) !== request.fingerprint
          )
            throw new FinancialError(
              'Stale request: original financial records changed. Reject and request a fresh review.',
              409,
            )
          const proposer = { ...user, id: request.actorUserId }
          access.manage(proposer, home, request.values, sources(proposer, home))
          validatePlanner(
            request.values,
            data,
            store.records(home),
            localBillDate(),
            request.targetId ?? undefined,
          )
          record = store.write(home, user.id, request.values, request.targetId ?? undefined)
        }
        const result = {
          request: store.review(home, id, user.id, p.decision),
          ...(record ? { record } : {}),
        }
        audit(
          user,
          home,
          id,
          'request_' + p.decision,
          { ...p, id } as typeof p,
          { reason: p.reason, proposer: request.actorUserId },
          result,
        )
        return result
      })
    },
    balance(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        if (access.context(user, home).role !== 'owner')
          throw new FinancialError('Only the Owner can confirm household bank balances.', 403)
        const p = z
          .object({
            accountId: z.uuid(),
            availableCents: z
              .number()
              .int()
              .min(-Number.MAX_SAFE_INTEGER)
              .max(Number.MAX_SAFE_INTEGER),
            effectiveAt: z.iso.datetime(),
            timezone: z.string().min(1).max(80),
            source: z.enum(['user_reported', 'reconciled']),
            pendingIncluded: z.enum(['yes', 'no', 'unknown']),
            includedPending: z
              .array(
                z
                  .object({
                    eventId: z.string().min(1).max(200),
                    amountCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                  })
                  .strict(),
              )
              .max(300),
            notes: z.string().max(500),
            proof: z.string().max(1000),
            idempotencyKey: z.uuid(),
          })
          .strict()
          .parse(body)
        const again = replay(user, home, p.idempotencyKey, p)
        if (again) return again
        try {
          new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format()
        } catch {
          throw new FinancialError('Select a valid IANA time zone.', 400)
        }
        const account = sources(user, home).cashAccounts?.find((a) => a.id === p.accountId)
        if (!account || account.type === 'credit_card' || account.currency !== 'USD')
          throw new FinancialError('Choose an existing USD cash account.', 400)
        if (p.source === 'reconciled' && !p.proof.trim())
          throw new FinancialError('Describe the reconciliation evidence.', 400)
        if (
          (p.pendingIncluded !== 'yes' && p.includedPending.length) ||
          new Set(p.includedPending.map((i) => i.eventId)).size !== p.includedPending.length
        )
          throw new FinancialError('Specify each included pending debit once.', 400)
        const data = sources(user, home),
          report = smartPlanner(
            data,
            smartForecastInput(
              visibleForecastSettings(forecasts.settings(home)[0] ?? null, data),
              localBillDate(),
              90,
            ),
            localBillDate(),
          )
        for (const hold of p.includedPending)
          if (
            !report.forecast.events.some(
              (e) =>
                e.id === hold.eventId &&
                e.kind === 'pending' &&
                e.direction === 'out' &&
                e.amountCents === hold.amountCents,
            )
          )
            throw new FinancialError(
              'Included holds must match an existing pending payment and amount.',
              400,
            )
        for (const a of data.cashAccounts ?? []) {
          if (a.id === p.accountId) continue
          const captured = store
            .records(home)
            .filter(
              (r) =>
                r.values.kind === 'balance' &&
                r.values.accountId === a.id &&
                r.values.balanceId === a.balance?.id,
            )
          if (
            captured.some(
              (r) =>
                r.values.kind === 'balance' &&
                r.values.includedPending.some((h) =>
                  p.includedPending.some((i) => i.eventId === h.eventId),
                ),
            )
          )
            throw new FinancialError(
              'A pending hold is already attributed to another account balance. Reconcile its source account first.',
              400,
            )
        }
        const observed = banks.observe(user, home, p.accountId, {
          idempotencyKey: p.idempotencyKey,
          values: {
            availableCents: p.availableCents,
            currentCents: null,
            observedAt: p.effectiveAt,
            notes: p.notes || null,
          },
        })
        const values = plannerInputSchema.parse({
          kind: 'balance',
          name: account.name + ' available balance',
          notes: p.notes,
          accountId: p.accountId,
          balanceId: observed.id,
          effectiveAt: p.effectiveAt,
          timezone: p.timezone,
          source: p.source,
          verification: {
            verified: p.source === 'reconciled',
            source: p.proof,
            verifiedAt: p.source === 'reconciled' ? new Date().toISOString() : null,
          },
          pendingIncluded: p.pendingIncluded,
          includedPending: p.includedPending,
        })
        const record = store.write(home, user.id, values),
          result = { record }
        audit(
          user,
          home,
          record.id,
          'available_balance_updated',
          p,
          { observationId: observed.id, accountId: p.accountId },
          result,
        )
        return result
      })
    },
    snapshot(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        if (access.context(user, home).role === 'viewer')
          throw new FinancialError('Read-only access', 403)
        const p = z
            .object({
              values: forecastInputSchema,
              fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
              idempotencyKey: z.uuid(),
            })
            .strict()
            .parse(body),
          data = sources(user, home),
          again = replay(user, home, p.idempotencyKey, p)
        if (again) {
          const snapshot = store
            .snapshots(home)
            .find((s) => s.id === (again.snapshot as { id: string })?.id)
          if (snapshot && !canSnapshot(user, home, snapshot.sourcesJson, data))
            throw new FinancialError('Snapshot sources are no longer available', 403)
          return again
        }
        if (p.fingerprint !== fingerprint(data, home))
          throw new FinancialError('Financial records changed. Refresh before saving.', 409)
        const trusted = visibleForecastSettings(forecasts.settings(home)[0] ?? null, data)
        if (!p.values.smart)
          throw new FinancialError('Smart planning requires dated cash settings.', 400)
        if (JSON.stringify(trusted?.opening ?? null) !== JSON.stringify(p.values.smart.opening))
          validateOpeningCash(p.values.smart.opening, data, new Date().toISOString())
        // A scenario can change buffer and assumptions, never invent historical included cash IDs.
        if (
          p.values.smart.opening &&
          JSON.stringify(p.values.smart.opening) !== JSON.stringify(trusted?.opening)
        )
          throw new FinancialError(
            'Confirm opening cash using Cash flow before saving a plan.',
            400,
          )
        const report = smartPlanner(data, p.values, localBillDate()),
          snapshot = store.snapshot(home, user.id, p.values, data, report, p.fingerprint),
          result = { snapshot }
        audit(user, home, snapshot.id, 'snapshot_saved', p, { name: p.values.name }, result)
        return result
      })
    },
    history(user: PublicUser, home: string, id: string) {
      const ctx = access.context(user, home),
        data = sources(user, home),
        record = store.records(home).find((r) => r.id === id)
      if (!record || !access.visible(record.values, data))
        throw new FinancialError('Record not found', 404)
      const rows = store.auditRows(home),
        requestIds = new Set(
          store
            .requests(home)
            .filter((request) => request.targetId === id)
            .map((request) => request.id),
        )
      // Creation requests have no target until approval creates their record.
      // Follow that persisted result to include their submission in the same history.
      for (const row of rows) {
        const result = JSON.parse(row.resultJson) as {
          record?: { id: string }
          request?: { id: string }
        }
        if (result.record?.id === id && result.request?.id) requestIds.add(result.request.id)
      }
      return rows
        .filter(
          (a) =>
            (a.targetId === id ||
              requestIds.has(a.targetId) ||
              (JSON.parse(a.resultJson) as { record?: { id: string } }).record?.id === id) &&
            (ctx.role === 'owner' || a.actorUserId === user.id),
        )
        .map(({ id, action, createdAt, actorUserId, detailsJson }) => ({
          id,
          action,
          createdAt,
          actorUserId,
          details: JSON.parse(detailsJson),
        }))
    },
  }
}
export type PlannerService = ReturnType<typeof plannerService>
