import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  settlementOffers,
  settlementInstallments,
  payoffScenarios,
  planningAudit,
} from '../../../../../packages/db/src/schema'
import {
  settlementSchema,
  payoffScenarioSchema,
  type SettlementInput,
  type Debt,
  type PayoffScenarioInput,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function planningRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) =>
    and(eq(settlementOffers.householdId, home), eq(settlementOffers.id, id))
  function offers(home: string) {
    const items = db
      .select()
      .from(settlementInstallments)
      .where(eq(settlementInstallments.householdId, home))
      .all()
    return db
      .select()
      .from(settlementOffers)
      .where(eq(settlementOffers.householdId, home))
      .all()
      .map((r) => ({
        ...r,
        ...settlementSchema.parse({
          ...JSON.parse(r.valuesJson),
          schedule: items
            .filter((i) => i.offerId === r.id)
            .map(({ id, dueDate, amountCents, paymentId }) => ({
              id,
              dueDate,
              amountCents,
              paymentId,
            })),
        }),
      }))
  }
  return {
    offers,
    scenarios(home: string) {
      return db
        .select()
        .from(payoffScenarios)
        .where(eq(payoffScenarios.householdId, home))
        .all()
        .map((r) => ({
          ...r,
          input: payoffScenarioSchema.parse(JSON.parse(r.inputJson)),
          debts: JSON.parse(r.debtSnapshotJson) as Debt[],
        }))
    },
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    write(
      home: string,
      actor: string,
      v: SettlementInput,
      submission: string,
      old?: ReturnType<typeof offers>[number],
    ) {
      const now = new Date().toISOString(),
        id = old?.id ?? randomUUID(),
        { schedule, ...values } = v
      const row = {
        id,
        householdId: home,
        debtId: v.debtId,
        valuesJson: JSON.stringify({ ...values, schedule: [] }),
        revision: (old?.revision ?? 0) + 1,
        idempotencyKey: old?.idempotencyKey ?? submission,
        createdByUserId: old?.createdByUserId ?? actor,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      }
      if (old) db.update(settlementOffers).set(row).where(key(home, id)).run()
      else db.insert(settlementOffers).values(row).run()
      const prior = db
        .select()
        .from(settlementInstallments)
        .where(
          and(eq(settlementInstallments.householdId, home), eq(settlementInstallments.offerId, id)),
        )
        .all()
      for (const p of prior)
        if (!schedule.some((s) => s.id === p.id))
          db.delete(settlementInstallments).where(eq(settlementInstallments.id, p.id)).run()
      for (const p of schedule) {
        const before = prior.find((s) => s.id === p.id)
        if (before)
          db.update(settlementInstallments)
            .set({ ...p, updatedAt: now })
            .where(eq(settlementInstallments.id, p.id))
            .run()
        else
          db.insert(settlementInstallments)
            .values({
              ...p,
              householdId: home,
              offerId: id,
              debtId: v.debtId,
              createdAt: now,
              updatedAt: now,
            })
            .run()
      }
      return offers(home).find((r) => r.id === id)!
    },
    scenario(
      home: string,
      actor: string,
      input: PayoffScenarioInput,
      debts: Debt[],
      idempotencyKey: string,
    ) {
      const row = {
        id: randomUUID(),
        householdId: home,
        createdByUserId: actor,
        inputJson: JSON.stringify(input),
        debtSnapshotJson: JSON.stringify(debts),
        idempotencyKey,
        createdAt: new Date().toISOString(),
      }
      db.insert(payoffScenarios).values(row).run()
      return row
    },
    audit(
      home: string,
      actor: string,
      targetId: string,
      action: string,
      before: unknown,
      after: unknown,
    ) {
      db.insert(planningAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          targetId,
          action,
          beforeJson: before ? JSON.stringify(before) : null,
          afterJson: JSON.stringify(after),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, id: string) {
      return db
        .select()
        .from(planningAudit)
        .where(and(eq(planningAudit.householdId, home), eq(planningAudit.targetId, id)))
        .all()
    },
  }
}
export type PlanningRepository = ReturnType<typeof planningRepository>
