import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  assetSchema,
  createAssetSchema,
  valuationSchema,
  createTradingSchema,
  editTradingSchema,
  netWorth,
  localBillDate,
  type PublicUser,
  type AssetSources,
  type ValuationInput,
} from '@goxfinance/shared'
import type { TradingPermissions } from '../trading/trading.permissions'
import { checkRevision } from '../trading/trading.permissions'
import { FinancialError } from '../households/financial-access'
import type { DebtService } from '../debts/debt.service'
import type { AssetRepository } from './asset.repository'
export function assetService(
  store: AssetRepository,
  access: TradingPermissions,
  debts: DebtService,
  balanceSource: (home: string) => AssetSources['balances'],
) {
  const hash = (s: AssetSources) => createHash('sha256').update(JSON.stringify(s)).digest('hex')
  function find(user: PublicUser, home: string, id: string) {
    access.context(user, home)
    const r = store.all(home).find((a) => a.id === id)
    if (!r) throw new FinancialError('Asset not found', 404)
    return r
  }
  function canManage(user: PublicUser, home: string, members: string[]) {
    const ctx = access.context(user, home)
    return (
      ctx.role === 'owner' ||
      (ctx.role !== 'viewer' &&
        !!ctx.self &&
        members.includes(ctx.self.id) &&
        !ctx.people.some(
          (p) => members.includes(p.id) && p.linkedUserId === ctx.home.createdByUserId,
        ))
    )
  }
  function manage(user: PublicUser, home: string, members: string[]) {
    if (!canManage(user, home, members))
      throw new FinancialError(
        'Only authorized members can manage this asset; Owner-linked assets require the Owner',
        403,
      )
  }
  function valueValid(v: ValuationInput, category: string) {
    if (v.valuationDate > localBillDate())
      throw new FinancialError('Future valuations are not current assets', 400)
    if (v.valueCents !== null && v.valueCents < 0 && !['cash', 'checking'].includes(category))
      throw new FinancialError(
        'Negative values are supported only for cash/checking overdrafts',
        400,
      )
  }
  function sources(user: PublicUser, home: string): AssetSources {
    access.context(user, home)
    return {
      assets: store.all(home).map((a) => ({ ...a, canManage: canManage(user, home, a.memberIds) })),
      valuations: store.values(home),
      debts: debts.list(user, home).debts,
      balances: balanceSource(home),
    }
  }
  return {
    list(user: PublicUser, home: string) {
      const ctx = access.context(user, home),
        s = sources(user, home)
      return {
        ...s,
        members: ctx.people.map((p) => ({ id: p.id, fullName: p.fullName, status: p.status })),
        fingerprint: hash(s),
        canCreate: ctx.role !== 'viewer',
        canCaptureHousehold: access.canManage(user, home, null),
        canCaptureMemberIds: ctx.people
          .filter((p) => access.canManage(user, home, p.id))
          .map((p) => p.id),
        snapshots: store
          .snapshots(home)
          .map(({ id, report, createdAt }) => ({ id, report, createdAt })),
      }
    },
    save(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const ctx = access.context(user, home),
          p = id
            ? editTradingSchema(assetSchema).parse(body)
            : createTradingSchema(createAssetSchema).parse(body),
          old = id ? find(user, home, id) : undefined
        if (old) {
          manage(user, home, old.memberIds)
          checkRevision(old.revision, 'revision' in p ? p.revision : 0)
        }
        manage(user, home, p.values.memberIds)
        if (
          ctx.role !== 'owner' &&
          ((old &&
            JSON.stringify([...old.memberIds].sort()) !==
              JSON.stringify([...p.values.memberIds].sort())) ||
            (!old && p.values.memberIds.some((m) => m !== ctx.self?.id)))
        )
          throw new FinancialError('Only the Owner can change asset ownership assignments', 403)
        for (const member of p.values.memberIds)
          if (
            !ctx.people.some(
              (p) => p.id === member && (p.status === 'active' || old?.memberIds.includes(member)),
            )
          )
            throw new FinancialError('Choose active members from this household', 400)
        if (p.values.acquisitionDate && p.values.acquisitionDate > localBillDate())
          throw new FinancialError('Future acquisitions do not belong in current net worth', 400)
        for (const debtId of p.values.debtIds)
          debts.authorizePayment(user, home, debtId, ctx.role === 'owner' ? 'view' : 'modify')
        if ('idempotencyKey' in p) {
          const existing = store.all(home).find((a) => a.idempotencyKey === p.idempotencyKey)
          if (existing) {
            const event = store.history(home, existing.id).find((a) => a.action === 'created')
            if (
              existing.createdByUserId !== user.id ||
              JSON.stringify(JSON.parse(event?.afterJson ?? '{}').input) !==
                JSON.stringify(p.values)
            )
              throw new FinancialError('Submission key already used', 409)
            return existing
          }
        }
        const values = assetSchema.parse(
            Object.fromEntries(
              Object.keys(assetSchema.shape).map((k) => [k, p.values[k as keyof typeof p.values]]),
            ),
          ),
          r = store.write(
            home,
            user.id,
            values,
            'idempotencyKey' in p ? p.idempotencyKey : old!.idempotencyKey,
            old,
          )
        if (old && old.category !== values.category) {
          const rows = store.values(home).filter((v) => v.assetId === old.id)
          const replaced = new Set(rows.map((v) => v.supersedesId))
          const latest = rows
            .filter((v) => !replaced.has(v.id))
            .sort(
              (a, b) =>
                b.valuationDate.localeCompare(a.valuationDate) ||
                b.createdAt.localeCompare(a.createdAt),
            )[0]
          if (latest) valueValid(latest, values.category)
        }
        if ('valuation' in p.values) {
          valueValid(p.values.valuation, r.category)
          if (p.values.valuation.supersedesId)
            throw new FinancialError('An initial valuation cannot correct another asset', 400)
          store.valuation(
            home,
            user.id,
            r.id,
            p.values.valuation,
            'idempotencyKey' in p ? p.idempotencyKey : randomUUID(),
          )
        }
        store.audit(home, user.id, r.id, old ? 'profile_corrected' : 'created', old, {
          record: r,
          input: p.values,
          ...('reason' in p ? { reason: p.reason } : {}),
        })
        return r
      })
    },
    value(user: PublicUser, home: string, id: string, body: unknown) {
      return store.atomic(() => {
        const p = z
            .object({
              idempotencyKey: z.uuid(),
              revision: z.number().int().positive(),
              values: valuationSchema,
              reason: z.string().trim().min(1).max(2000),
            })
            .strict()
            .parse(body),
          old = find(user, home, id)
        manage(user, home, old.memberIds)
        const previous = store.values(home).find((v) => v.idempotencyKey === p.idempotencyKey)
        if (previous) {
          if (
            previous.assetId !== id ||
            previous.recordedByUserId !== user.id ||
            JSON.stringify(
              valuationSchema.parse(
                Object.fromEntries(
                  Object.keys(valuationSchema.shape).map((k) => [
                    k,
                    previous[k as keyof typeof previous],
                  ]),
                ),
              ),
            ) !== JSON.stringify(p.values)
          )
            throw new FinancialError('Submission key already used', 409)
          return previous
        }
        checkRevision(old.revision, p.revision)
        valueValid(p.values, old.category)
        if (old.status !== 'active')
          throw new FinancialError('Restore this asset before adding valuations', 409)
        if (
          p.values.supersedesId &&
          (!store.values(home).some((v) => v.id === p.values.supersedesId && v.assetId === id) ||
            store.values(home).some((v) => v.supersedesId === p.values.supersedesId))
        )
          throw new FinancialError('Choose an unsuperseded valuation on this asset', 409)
        const row = store.valuation(home, user.id, id, p.values, p.idempotencyKey)
        store.touch(home, id)
        store.audit(home, user.id, id, 'valuation_recorded', old, {
          valuation: row,
          reason: p.reason,
        })
        return row
      })
    },
    capture(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const p = z
          .object({
            idempotencyKey: z.uuid(),
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            memberId: z.uuid().nullable(),
          })
          .strict()
          .parse(body)
        access.manage(user, home, p.memberId)
        const previous = store.snapshots(home).find((s) => s.idempotencyKey === p.idempotencyKey)
        if (previous) {
          if (previous.createdByUserId !== user.id || previous.report.memberId !== p.memberId)
            throw new FinancialError('Submission key already used', 409)
          return previous
        }
        const s = sources(user, home)
        if (hash(s) !== p.fingerprint)
          throw new FinancialError('Asset or debt records changed; refresh before capturing', 409)
        return store.snapshot(
          home,
          user.id,
          netWorth(s, localBillDate(), p.memberId, localBillDate()),
          s,
          p.idempotencyKey,
        )
      })
    },
    history(user: PublicUser, home: string, id: string) {
      find(user, home, id)
      return store.history(home, id)
    },
  }
}
export type AssetService = ReturnType<typeof assetService>
