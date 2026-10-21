import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  plannerRecords,
  plannerRequests,
  plannerAudit,
  plannerSnapshots,
} from '../../../../../packages/db/src/schema'
import {
  plannerInputSchema,
  type PlannerInput,
  type PlannerRecord,
  type PlannerRequest,
  type ForecastSources,
  type ForecastInput,
  type PlannerReport,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function plannerRepository(db: DatabaseConnection) {
  const records = (home: string): PlannerRecord[] =>
    db
      .select()
      .from(plannerRecords)
      .where(eq(plannerRecords.householdId, home))
      .all()
      .map((r) => ({ ...r, values: plannerInputSchema.parse(JSON.parse(r.valuesJson)) }))
  const requests = (home: string): PlannerRequest[] =>
    db
      .select()
      .from(plannerRequests)
      .where(eq(plannerRequests.householdId, home))
      .all()
      .map((r) => ({
        ...r,
        status: r.status as PlannerRequest['status'],
        values: plannerInputSchema.parse(JSON.parse(r.valuesJson)),
      }))
  return {
    records,
    requests,
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    auditRows(home: string) {
      return db.select().from(plannerAudit).where(eq(plannerAudit.householdId, home)).all()
    },
    audit(
      home: string,
      actor: string,
      target: string,
      action: string,
      details: unknown,
      key: string,
      digest: string,
      result: unknown,
    ) {
      db.insert(plannerAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          targetId: target,
          action,
          detailsJson: JSON.stringify(details),
          idempotencyKey: key,
          digest,
          resultJson: JSON.stringify(result),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    write(home: string, actor: string, values: PlannerInput, id?: string) {
      const old = records(home).find((r) => r.id === id),
        now = new Date().toISOString(),
        savedId = old?.id ?? id ?? randomUUID()
      if (old)
        db.update(plannerRecords)
          .set({ valuesJson: JSON.stringify(values), revision: old.revision + 1, updatedAt: now })
          .where(and(eq(plannerRecords.householdId, home), eq(plannerRecords.id, old.id)))
          .run()
      else
        db.insert(plannerRecords)
          .values({
            id: savedId,
            householdId: home,
            createdByUserId: actor,
            valuesJson: JSON.stringify(values),
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      return records(home).find((r) => r.id === savedId)!
    },
    request(
      home: string,
      actor: string,
      targetId: string | null,
      revision: number,
      values: PlannerInput,
      fingerprint: string,
      reason: string,
    ) {
      const id = randomUUID()
      db.insert(plannerRequests)
        .values({
          id,
          householdId: home,
          actorUserId: actor,
          targetId,
          revision,
          valuesJson: JSON.stringify(values),
          fingerprint,
          reason,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
        .run()
      return requests(home).find((r) => r.id === id)!
    },
    review(home: string, id: string, actor: string, status: PlannerRequest['status']) {
      db.update(plannerRequests)
        .set({ status, reviewedByUserId: actor, reviewedAt: new Date().toISOString() })
        .where(and(eq(plannerRequests.householdId, home), eq(plannerRequests.id, id)))
        .run()
      return requests(home).find((r) => r.id === id)!
    },
    snapshots(home: string) {
      return db
        .select()
        .from(plannerSnapshots)
        .where(eq(plannerSnapshots.householdId, home))
        .all()
        .map((r) => ({ ...r, report: JSON.parse(r.reportJson) as PlannerReport }))
    },
    snapshot(
      home: string,
      actor: string,
      input: ForecastInput,
      sources: ForecastSources,
      report: PlannerReport,
      fingerprint: string,
    ) {
      const row = {
        id: randomUUID(),
        householdId: home,
        actorUserId: actor,
        name: input.name,
        inputJson: JSON.stringify(input),
        sourcesJson: JSON.stringify(sources),
        reportJson: JSON.stringify(report),
        fingerprint,
        createdAt: new Date().toISOString(),
      }
      db.insert(plannerSnapshots).values(row).run()
      return { id: row.id, name: row.name, createdAt: row.createdAt, report }
    },
  }
}
export type PlannerRepository = ReturnType<typeof plannerRepository>
