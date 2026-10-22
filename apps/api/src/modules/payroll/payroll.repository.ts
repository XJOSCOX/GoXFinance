import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as s from '../../../../../packages/db/src/schema'
import type { DatabaseConnection } from '../../db/connection'
import {
  payrollProfileSchema,
  weeklyHoursSchema,
  payrollStatementSchema,
  type PayrollWeek,
  type PayrollForecast,
} from '@goxfinance/shared'
export function payrollRepository(db: DatabaseConnection) {
  const scope = (home: string, id: string) =>
    and(eq(s.payrollWeeks.householdId, home), eq(s.payrollWeeks.id, id))
  function profiles(home: string) {
    return db
      .select()
      .from(s.payrollProfiles)
      .where(eq(s.payrollProfiles.householdId, home))
      .all()
      .map((r) => ({
        ...payrollProfileSchema.parse(JSON.parse(r.valuesJson)),
        id: r.id,
        revision: r.revision,
        updatedAt: r.updatedAt,
      }))
  }
  function statement(
    home: string,
    id: string | null,
    cache?: {
      statements: (typeof s.payrollStatements.$inferSelect)[]
      lines: (typeof s.payrollLines.$inferSelect)[]
    },
  ) {
    if (!id) return null
    const row = cache
      ? cache.statements.find((r) => r.id === id)
      : db
          .select()
          .from(s.payrollStatements)
          .where(and(eq(s.payrollStatements.householdId, home), eq(s.payrollStatements.id, id)))
          .get()
    if (!row) return null
    const lines = (
      cache
        ? cache.lines.filter((l) => l.statementId === id)
        : db
            .select()
            .from(s.payrollLines)
            .where(and(eq(s.payrollLines.householdId, home), eq(s.payrollLines.statementId, id)))
            .all()
    ).sort((a, b) => a.position - b.position)
    return payrollStatementSchema.parse({
      ...JSON.parse(row.headerJson),
      grossCents: row.grossCents,
      deductionsCents: row.deductionsCents,
      netCents: row.netCents,
      lines: lines.map(
        ({
          id: unused,
          householdId: unusedHome,
          statementId: unusedStatement,
          position: unusedPosition,
          ...line
        }) => {
          void unused
          void unusedHome
          void unusedStatement
          void unusedPosition
          return line
        },
      ),
    })
  }
  function weeks(home: string): PayrollWeek[] {
    const cache = {
      statements: db
        .select()
        .from(s.payrollStatements)
        .where(eq(s.payrollStatements.householdId, home))
        .all(),
      lines: db.select().from(s.payrollLines).where(eq(s.payrollLines.householdId, home)).all(),
    }
    const forecasts = db
      .select()
      .from(s.payrollForecasts)
      .where(eq(s.payrollForecasts.householdId, home))
      .all()
    return db
      .select()
      .from(s.payrollWeeks)
      .where(eq(s.payrollWeeks.householdId, home))
      .all()
      .map((r) => ({
        ...weeklyHoursSchema.parse(JSON.parse(r.hoursJson)),
        id: r.id,
        householdId: home,
        stage: r.stage as PayrollWeek['stage'],
        revision: r.revision,
        incomeTransactionId: r.incomeTransactionId,
        statementReceivedAt: r.statementReceivedAt,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        statement: statement(home, r.statementId, cache),
        forecasts: forecasts
          .filter((f) => f.weekId === r.id)
          .map((f) => ({
            id: f.id,
            createdAt: f.createdAt,
            modelVersion: f.modelVersion,
            eligibleForAccuracy: f.eligibleForAccuracy,
            result: JSON.parse(f.resultJson) as PayrollForecast,
          })),
        canManage: false,
      }))
  }
  return {
    db,
    profiles,
    weeks,
    statement,
    receiveUpload(home: string, actor: string, digest: string, receivedAt: string) {
      db.insert(s.payrollUploadReceipts)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          documentDigest: digest,
          receivedAt,
        })
        .onConflictDoNothing()
        .run()
      return db
        .select()
        .from(s.payrollUploadReceipts)
        .where(
          and(
            eq(s.payrollUploadReceipts.householdId, home),
            eq(s.payrollUploadReceipts.actorUserId, actor),
            eq(s.payrollUploadReceipts.documentDigest, digest),
          ),
        )
        .get()!
    },
    uploadReceipt(home: string, actor: string, digest: string) {
      return db
        .select()
        .from(s.payrollUploadReceipts)
        .where(
          and(
            eq(s.payrollUploadReceipts.householdId, home),
            eq(s.payrollUploadReceipts.actorUserId, actor),
            eq(s.payrollUploadReceipts.documentDigest, digest),
          ),
        )
        .get()
    },
    aliases(home: string) {
      return db
        .select({ sourceId: s.payrollStatements.sourceId, header: s.payrollStatements.headerJson })
        .from(s.payrollStatements)
        .where(eq(s.payrollStatements.householdId, home))
        .all()
        .map((r) => ({
          sourceId: r.sourceId,
          ...(JSON.parse(r.header) as { employer: string | null; assignment: string | null }),
        }))
    },
    importReplay(home: string, key: string) {
      return db
        .select()
        .from(s.payrollAudit)
        .where(
          and(
            eq(s.payrollAudit.householdId, home),
            eq(s.payrollAudit.action, 'upload_import_saved'),
          ),
        )
        .all()
        .find((r) => JSON.parse(r.afterJson).idempotencyKey === key)
    },
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    rawWeek(home: string, id: string) {
      return db.select().from(s.payrollWeeks).where(scope(home, id)).get()
    },
    patch(home: string, id: string, values: Partial<typeof s.payrollWeeks.$inferInsert>) {
      db.update(s.payrollWeeks).set(values).where(scope(home, id)).run()
    },
    profile(home: string, source: string, json: string, revision: number) {
      const now = new Date().toISOString(),
        old = profiles(home).find((p) => p.sourceId === source)
      if (old)
        db.update(s.payrollProfiles)
          .set({ valuesJson: json, revision: revision + 1, updatedAt: now })
          .where(and(eq(s.payrollProfiles.householdId, home), eq(s.payrollProfiles.id, old.id)))
          .run()
      else
        db.insert(s.payrollProfiles)
          .values({
            id: randomUUID(),
            householdId: home,
            sourceId: source,
            valuesJson: json,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      return profiles(home).find((p) => p.sourceId === source)!
    },
    insertWeek(row: typeof s.payrollWeeks.$inferInsert) {
      db.insert(s.payrollWeeks).values(row).run()
    },
    insertStatement(
      row: typeof s.payrollStatements.$inferInsert,
      lines: (typeof s.payrollLines.$inferInsert)[],
    ) {
      db.insert(s.payrollStatements).values(row).run()
      for (const line of lines) db.insert(s.payrollLines).values(line).run()
    },
    digest(home: string, digest: string) {
      return db
        .select()
        .from(s.payrollStatements)
        .where(
          and(
            eq(s.payrollStatements.householdId, home),
            eq(s.payrollStatements.documentDigest, digest),
          ),
        )
        .get()
    },
    models(home: string, source: string) {
      return db
        .select()
        .from(s.payrollModels)
        .where(and(eq(s.payrollModels.householdId, home), eq(s.payrollModels.sourceId, source)))
        .all()
    },
    model(row: typeof s.payrollModels.$inferInsert) {
      db.insert(s.payrollModels).values(row).run()
    },
    forecast(row: typeof s.payrollForecasts.$inferInsert) {
      db.insert(s.payrollForecasts).values(row).run()
    },
    audit(
      home: string,
      source: string,
      week: string | null,
      actor: string,
      action: string,
      before: unknown,
      after: unknown,
    ) {
      db.insert(s.payrollAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          sourceId: source,
          weekId: week,
          actorUserId: actor,
          action,
          beforeJson: before ? JSON.stringify(before) : null,
          afterJson: JSON.stringify(after),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, source: string) {
      return db
        .select()
        .from(s.payrollAudit)
        .where(and(eq(s.payrollAudit.householdId, home), eq(s.payrollAudit.sourceId, source)))
        .all()
    },
  }
}
export type PayrollRepository = ReturnType<typeof payrollRepository>
