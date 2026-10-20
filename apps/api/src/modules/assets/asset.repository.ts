import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  assets,
  assetMembers,
  assetDebtLinks,
  assetValuations,
  assetAudit,
  netWorthSnapshots,
} from '../../../../../packages/db/src/schema'
import {
  assetSchema,
  type AssetInput,
  type ValuationInput,
  type AssetValuation,
  type AssetSources,
  type NetWorthReport,
} from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function assetRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) => and(eq(assets.householdId, home), eq(assets.id, id))
  function all(home: string) {
    const members = db.select().from(assetMembers).where(eq(assetMembers.householdId, home)).all(),
      links = db.select().from(assetDebtLinks).where(eq(assetDebtLinks.householdId, home)).all()
    return db
      .select()
      .from(assets)
      .where(eq(assets.householdId, home))
      .all()
      .map((r) => ({
        ...r,
        ...assetSchema.parse({
          name: r.name,
          category: r.category,
          acquisitionDate: r.acquisitionDate,
          purchaseCents: r.purchaseCents,
          notes: r.notes,
          status: r.status,
          memberIds: members.filter((m) => m.assetId === r.id).map((m) => m.memberId),
          debtIds: links.filter((d) => d.assetId === r.id).map((d) => d.debtId),
        }),
      }))
  }
  return {
    all,
    values(home: string) {
      return db
        .select()
        .from(assetValuations)
        .where(eq(assetValuations.householdId, home))
        .all() as (AssetValuation & { idempotencyKey: string })[]
    },
    snapshots(home: string) {
      return db
        .select()
        .from(netWorthSnapshots)
        .where(eq(netWorthSnapshots.householdId, home))
        .all()
        .map((r) => ({ ...r, report: JSON.parse(r.reportJson) as NetWorthReport }))
    },
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    write(
      home: string,
      actor: string,
      v: AssetInput,
      submission: string,
      old?: ReturnType<typeof all>[number],
    ) {
      const { memberIds, debtIds, ...fields } = v,
        now = new Date().toISOString(),
        id = old?.id ?? randomUUID(),
        row = {
          ...fields,
          id,
          householdId: home,
          createdByUserId: old?.createdByUserId ?? actor,
          idempotencyKey: old?.idempotencyKey ?? submission,
          revision: (old?.revision ?? 0) + 1,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        }
      if (old) db.update(assets).set(row).where(key(home, id)).run()
      else db.insert(assets).values(row).run()
      const ms = db
          .select()
          .from(assetMembers)
          .where(and(eq(assetMembers.householdId, home), eq(assetMembers.assetId, id)))
          .all(),
        ls = db
          .select()
          .from(assetDebtLinks)
          .where(and(eq(assetDebtLinks.householdId, home), eq(assetDebtLinks.assetId, id)))
          .all()
      for (const m of ms)
        if (!memberIds.includes(m.memberId))
          db.delete(assetMembers).where(eq(assetMembers.id, m.id)).run()
      for (const memberId of memberIds)
        if (!ms.some((m) => m.memberId === memberId))
          db.insert(assetMembers)
            .values({ id: randomUUID(), householdId: home, assetId: id, memberId })
            .run()
      for (const l of ls)
        if (!debtIds.includes(l.debtId))
          db.delete(assetDebtLinks).where(eq(assetDebtLinks.id, l.id)).run()
      for (const debtId of debtIds)
        if (!ls.some((l) => l.debtId === debtId))
          db.insert(assetDebtLinks)
            .values({ id: randomUUID(), householdId: home, assetId: id, debtId })
            .run()
      return all(home).find((r) => r.id === id)!
    },
    valuation(
      home: string,
      actor: string,
      assetId: string,
      v: ValuationInput,
      idempotencyKey: string,
    ) {
      const row = {
        ...v,
        id: randomUUID(),
        householdId: home,
        assetId,
        idempotencyKey,
        recordedByUserId: actor,
        createdAt: new Date().toISOString(),
      }
      db.insert(assetValuations).values(row).run()
      return row
    },
    touch(home: string, id: string) {
      const old = all(home).find((a) => a.id === id)!
      db.update(assets)
        .set({ revision: old.revision + 1, updatedAt: new Date().toISOString() })
        .where(key(home, id))
        .run()
    },
    audit(
      home: string,
      actor: string,
      assetId: string,
      action: string,
      before: unknown,
      after: unknown,
    ) {
      db.insert(assetAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          assetId,
          actorUserId: actor,
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
        .from(assetAudit)
        .where(and(eq(assetAudit.householdId, home), eq(assetAudit.assetId, id)))
        .all()
    },
    snapshot(
      home: string,
      actor: string,
      report: NetWorthReport,
      sources: AssetSources,
      idempotencyKey: string,
    ) {
      const row = {
        id: randomUUID(),
        householdId: home,
        createdByUserId: actor,
        reportJson: JSON.stringify(report),
        sourcesJson: JSON.stringify(sources),
        idempotencyKey,
        createdAt: new Date().toISOString(),
      }
      db.insert(netWorthSnapshots).values(row).run()
      return row
    },
  }
}
export type AssetRepository = ReturnType<typeof assetRepository>
