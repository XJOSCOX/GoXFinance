import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  forecastScenarios,
  forecastAudit,
  forecastSettingsVersions,
} from '../../../../../packages/db/src/schema'
import {
  forecastInputSchema,
  forecastPreferencesSchema,
  type ForecastPreferences,
  type ForecastSources,
  type ForecastInput,
  type ForecastReport,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function forecastRepository(db: DatabaseConnection) {
  return {
    settings(home: string) {
      return db
        .select()
        .from(forecastSettingsVersions)
        .where(eq(forecastSettingsVersions.householdId, home))
        .all()
        .sort((a, b) => b.revision - a.revision)
        .map((r) => ({
          ...forecastPreferencesSchema.parse(JSON.parse(r.valuesJson)),
          id: r.id,
          revision: r.revision,
          createdAt: r.createdAt,
          actorUserId: r.actorUserId,
          idempotencyKey: r.idempotencyKey,
          reason: r.reason,
        }))
    },
    saveSettings(
      home: string,
      actor: string,
      values: ForecastPreferences,
      revision: number,
      reason: string,
      idempotencyKey: string,
    ) {
      const row = {
        id: randomUUID(),
        householdId: home,
        actorUserId: actor,
        revision,
        valuesJson: JSON.stringify(values),
        reason,
        idempotencyKey,
        createdAt: new Date().toISOString(),
      }
      db.insert(forecastSettingsVersions).values(row).run()
      return { ...values, id: row.id, revision, createdAt: row.createdAt }
    },
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
          action: input.smart ? 'smart_scenario_saved_v2' : 'scenario_saved_v1',
          createdAt: row.createdAt,
        })
        .run()
      return row
    },
  }
}
export type ForecastRepository = ReturnType<typeof forecastRepository>
