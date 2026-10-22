import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  commandCenterSummary,
  commandPreferencesSchema,
  type PublicUser,
  type PayrollProfile,
} from '@goxfinance/shared'
import type { InsightsService } from '../insights/insights.service'
import type { FinancialAccess } from '../households/financial-access'
import { FinancialError } from '../households/financial-access'
import type { CommandRepository } from './command.repository'
const request = z
  .object({
    revision: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
    values: commandPreferencesSchema,
  })
  .strict()
export function commandService(
  store: CommandRepository,
  access: FinancialAccess,
  insights: InsightsService,
  profiles: (home: string) => PayrollProfile[],
) {
  return {
    get(user: PublicUser, home: string, month?: string) {
      const c = insights.command(user, home),
        row = store.latest(home, user.id),
        preferences = commandPreferencesSchema.parse(row ? JSON.parse(row.valuesJson) : {})
      const ids = new Set(c.s.income.sources.map((s) => s.id))
      return commandCenterSummary(c.s, c.plan, c.report, c.input, {
        home,
        today: c.today,
        now: c.now,
        month: month ?? c.today.slice(0, 7),
        owner: c.ctx.role === 'owner',
        canManage: c.ctx.role !== 'viewer',
        preferences,
        preferenceRevision: row?.revision ?? 0,
        profiles: profiles(home).filter((p) => ids.has(p.sourceId)),
      })
    },
    preferences(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const ctx = access.context(user, home)
        if (ctx.role !== 'owner' && !ctx.self)
          throw new FinancialError('Active membership required', 403)
        const p = request.parse(body),
          old = store.latest(home, user.id),
          replay = store.replay(home, user.id, p.idempotencyKey),
          valuesJson = JSON.stringify(p.values)
        if (replay) {
          if (replay.valuesJson !== valuesJson)
            throw new FinancialError('Submission key already used', 409)
          return { revision: replay.revision, values: p.values }
        }
        if ((old?.revision ?? 0) !== p.revision)
          throw new FinancialError('Display preferences changed. Refresh first.', 409)
        const revision = p.revision + 1
        store.save({
          id: randomUUID(),
          householdId: home,
          actorUserId: user.id,
          revision,
          valuesJson,
          idempotencyKey: p.idempotencyKey,
          createdAt: new Date().toISOString(),
        })
        return { revision, values: p.values }
      })
    },
  }
}
