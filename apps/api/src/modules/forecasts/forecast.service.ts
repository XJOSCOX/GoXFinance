import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  forecastInputSchema,
  forecastPreferencesSchema,
  confirmedForecastActivity,
  smartForecastInput,
  forecast,
  localBillDate,
  type ForecastSources,
  type PublicUser,
} from '@goxfinance/shared'
import type { TradingPermissions } from '../trading/trading.permissions'
import { visibleForecastSettings, validateOpeningCash } from './forecast-settings'
import { FinancialError } from '../households/financial-access'
import type { ForecastRepository } from './forecast.repository'
const request = z
  .object({
    idempotencyKey: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    values: forecastInputSchema,
  })
  .strict()
export function forecastService(
  store: ForecastRepository,
  access: TradingPermissions,
  sources: (user: PublicUser, home: string) => ForecastSources,
) {
  const permittedSnapshot = (json: string, data: ForecastSources) => {
    const old = JSON.parse(json) as ForecastSources
    return (
      old.income.sources.every((src) => data.income.sources.some((s) => s.id === src.id)) &&
      (old.cashAccounts ?? []).every((a) => data.cashAccounts?.some((c) => c.id === a.id))
    )
  }
  const hash = (data: ForecastSources, home: string) =>
    createHash('sha256')
      .update(JSON.stringify({ data, settings: store.settings(home)[0]?.id ?? null }))
      .digest('hex')
  return {
    list(user: PublicUser, home: string) {
      const ctx = access.context(user, home),
        data = sources(user, home)
      return {
        sources: data,
        fingerprint: hash(data, home),
        settings: visibleForecastSettings(store.settings(home)[0] ?? null, data),
        canSave: ctx.role !== 'viewer',
        scenarios: store
          .all(home)
          .filter(
            (r) =>
              ctx.role === 'owner' ||
              (r.createdByUserId === user.id && permittedSnapshot(r.sourcesJson, data)),
          )
          .map(({ id, input, report, createdAt }) => ({ id, input, report, createdAt })),
      }
    },
    smart(user: PublicUser, home: string, days: number) {
      access.context(user, home)
      const data = sources(user, home),
        settings = visibleForecastSettings(store.settings(home)[0] ?? null, data),
        input = smartForecastInput(settings, localBillDate(), days)
      return {
        input,
        report: forecast(data, input, localBillDate()),
        fingerprint: hash(data, home),
        settings,
      }
    },
    preferences(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const ctx = access.context(user, home)
        if (ctx.role === 'viewer') throw new FinancialError('Read-only access', 403)
        const p = z
          .object({
            values: forecastPreferencesSchema,
            revision: z.number().int().nonnegative(),
            reason: z.string().trim().min(1).max(2000),
            idempotencyKey: z.uuid(),
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            includeRecordedSameDayActivity: z.boolean(),
            keepOpening: z.boolean().default(false),
          })
          .strict()
          .parse(body)
        const history = store.settings(home),
          old = history[0],
          replay = history.find((r) => r.idempotencyKey === p.idempotencyKey)
        if (replay) {
          if (
            replay.actorUserId !== user.id ||
            replay.reason !== p.reason ||
            replay.bufferCents !== p.values.bufferCents ||
            (!p.keepOpening &&
              JSON.stringify(replay.opening && { ...replay.opening, includedActivityIds: [] }) !==
                JSON.stringify(
                  p.values.opening && { ...p.values.opening, includedActivityIds: [] },
                ))
          )
            throw new FinancialError('Submission key already used', 409)
          return visibleForecastSettings(replay, sources(user, home))
        }
        if ((old?.revision ?? 0) !== p.revision)
          throw new FinancialError('Cash flow settings changed. Refresh before confirming.', 409)
        const data = sources(user, home)
        if (hash(data, home) !== p.fingerprint)
          throw new FinancialError(
            'Financial sources changed. Refresh before confirming opening cash.',
            409,
          )
        const visible = visibleForecastSettings(old ?? null, data)
        let opening = p.values.opening
        if (p.keepOpening) {
          opening = old?.opening ?? null
        } else if (old?.opening && !visible?.opening && ctx.role !== 'owner') {
          if (opening)
            throw new FinancialError('You cannot replace a private account cash confirmation.', 403)
          opening = old.opening
        } else {
          validateOpeningCash(opening, data, new Date().toISOString())
          if (opening)
            opening = {
              ...opening,
              includedActivityIds: p.includeRecordedSameDayActivity
                ? confirmedForecastActivity(data, localBillDate())
                    .filter((a) => a.date === opening!.effectiveDate)
                    .map((a) => a.id)
                : [],
            }
        }
        return visibleForecastSettings(
          store.saveSettings(
            home,
            user.id,
            { opening, bufferCents: p.values.bufferCents },
            (old?.revision ?? 0) + 1,
            p.reason,
            p.idempotencyKey,
          ),
          data,
        )
      })
    },
    save(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const ctx = access.context(user, home)
        if (ctx.role === 'viewer') throw new FinancialError('Read-only access', 403)
        const p = request.parse(body),
          old = store.all(home).find((r) => r.idempotencyKey === p.idempotencyKey)
        if (old) {
          if (
            old.createdByUserId !== user.id ||
            JSON.stringify(old.input) !== JSON.stringify(p.values)
          )
            throw new FinancialError('Submission key already used', 409)
          const data = sources(user, home)
          if (ctx.role !== 'owner' && !permittedSnapshot(old.sourcesJson, data))
            throw new FinancialError('Snapshot contains sources you can no longer view.', 403)
          return { id: old.id, createdAt: old.createdAt }
        }
        const data = sources(user, home)
        if (hash(data, home) !== p.fingerprint)
          throw new FinancialError(
            'Financial records changed. Refresh and review this forecast before saving.',
            409,
          )
        if (p.values.smart) {
          const version = p.values.smart.settingsVersionId
            ? store.settings(home).find((r) => r.id === p.values.smart!.settingsVersionId)
            : undefined
          if (p.values.smart.settingsVersionId && !version)
            throw new FinancialError('Cash confirmation version not found', 400)
          const trusted = version && visibleForecastSettings(version, data)?.opening
          if (p.values.smart.opening && version && !trusted)
            throw new FinancialError('Opening cash confirmation is unavailable.', 403)
          if (!trusted || JSON.stringify(trusted) !== JSON.stringify(p.values.smart.opening)) {
            validateOpeningCash(p.values.smart.opening, data, new Date().toISOString())
            const actualIds = new Set(
              confirmedForecastActivity(data, localBillDate())
                .filter((a) => a.date === p.values.smart!.opening?.effectiveDate)
                .map((a) => a.id),
            )
            if (p.values.smart.opening?.includedActivityIds.some((id) => !actualIds.has(id)))
              throw new FinancialError(
                'Opening cash activity references do not belong to the permitted opening date.',
                400,
              )
          }
        }
        for (const a of p.values.income)
          if (!data.income.sources.some((s) => s.id === a.sourceId))
            throw new FinancialError('Income source not found in household', 400)
        const saved = store.save(
          home,
          user.id,
          p.values,
          data,
          forecast(data, p.values, localBillDate()),
          p.idempotencyKey,
        )
        return { id: saved.id, createdAt: saved.createdAt }
      })
    },
  }
}
export type ForecastService = ReturnType<typeof forecastService>
