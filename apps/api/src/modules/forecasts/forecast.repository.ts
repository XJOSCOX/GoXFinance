import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { forecastScenarios, forecastAudit } from '../../../../../packages/db/src/schema'
import {
  forecastInputSchema,
  type ForecastSources,
  type ForecastInput,
  type ForecastReport,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function forecastRepository(db: DatabaseConnection) {
  return {
    all(home: string) {
      return db
        .select()
        .from(forecastScenarios)
        .where(eq(forecastScenarios.householdId, home))
        .all()
        .map((r) => ({
          ...r,
          input: forecastInputSchema.parse(JSON.parse(r.inputJson)),
          report: JSON.parse(r.reportJson) as ForecastReport,
        }))
    },
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    save(
      home: string,
      actor: string,
      input: ForecastInput,
      sources: ForecastSources,
      report: ForecastReport,
      idempotencyKey: string,
    ) {
      const row = {
        id: randomUUID(),
        householdId: home,
        createdByUserId: actor,
        inputJson: JSON.stringify(input),
        sourcesJson: JSON.stringify(sources),
        reportJson: JSON.stringify(report),
        idempotencyKey,
        createdAt: new Date().toISOString(),
      }
      db.insert(forecastScenarios).values(row).run()
      db.insert(forecastAudit)
        .values({
          id: randomUUID(),
          scenarioId: row.id,
          householdId: home,
          actorUserId: actor,
          action: 'scenario_saved_v1',
          createdAt: row.createdAt,
        })
        .run()
      return row
    },
  }
}
export type ForecastRepository = ReturnType<typeof forecastRepository>
