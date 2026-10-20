import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  forecastInputSchema,
  forecast,
  localBillDate,
  type ForecastSources,
  type PublicUser,
} from '@goxfinance/shared'
import type { TradingPermissions } from '../trading/trading.permissions'
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
  const hash = (data: ForecastSources) =>
    createHash('sha256').update(JSON.stringify(data)).digest('hex')
  return {
    list(user: PublicUser, home: string) {
      const ctx = access.context(user, home),
        data = sources(user, home)
      return {
        sources: data,
        fingerprint: hash(data),
        canSave: ctx.role !== 'viewer',
        scenarios: store
          .all(home)
          .map(({ id, input, report, createdAt }) => ({ id, input, report, createdAt })),
      }
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
          return old
        }
        const data = sources(user, home)
        if (hash(data) !== p.fingerprint)
          throw new FinancialError(
            'Financial records changed. Refresh and review this forecast before saving.',
            409,
          )
        for (const a of p.values.income)
          if (!data.income.sources.some((s) => s.id === a.sourceId))
            throw new FinancialError('Income source not found in household', 400)
        return store.save(
          home,
          user.id,
          p.values,
          data,
          forecast(data, p.values, localBillDate()),
          p.idempotencyKey,
        )
      })
    },
  }
}
export type ForecastService = ReturnType<typeof forecastService>
