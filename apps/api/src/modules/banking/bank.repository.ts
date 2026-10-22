import { randomUUID } from 'node:crypto'
import { and, eq, desc } from 'drizzle-orm'
import {
  bankAccounts,
  bankAccountMembers,
  bankBalanceObservations,
  bankConnections,
  bankTransactions,
  bankAudit,
} from '../../../../../packages/db/src/schema'
import type { BankAccountInput, BankBalance, BankBalance as Balance } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
export function bankRepository(db: DatabaseConnection) {
  const key = (home: string, id: string) =>
    and(eq(bankAccounts.householdId, home), eq(bankAccounts.id, id))
  function accounts(home: string) {
    const members = db
      .select()
      .from(bankAccountMembers)
      .where(eq(bankAccountMembers.householdId, home))
      .all()
    return db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.householdId, home))
      .all()
      .map((a) => ({
        ...a,
        memberIds: members.filter((m) => m.accountId === a.id).map((m) => m.memberId),
      }))
  }
  return {
    atomic<T>(work: () => T) {
      return db.transaction(work, { behavior: 'immediate' })
    },
    accounts,
    connections(home: string) {
      return db.select().from(bankConnections).where(eq(bankConnections.householdId, home)).all()
    },
    balances(home: string, accountId?: string) {
      return db
        .select()
        .from(bankBalanceObservations)
        .where(
          and(
            eq(bankBalanceObservations.householdId, home),
            accountId ? eq(bankBalanceObservations.accountId, accountId) : undefined,
          ),
        )
        .orderBy(
          desc(bankBalanceObservations.observedAt),
          desc(bankBalanceObservations.createdAt),
          desc(bankBalanceObservations.id),
        )
        .all() as (BankBalance & { accountId: string })[]
    },
    transactions(home: string) {
      return db.select().from(bankTransactions).where(eq(bankTransactions.householdId, home)).all()
    },
    write(home: string, actor: string, v: BankAccountInput, submission: string, id?: string) {
      const old = accounts(home).find((a) => a.id === id),
        now = new Date().toISOString(),
        { memberIds, ...values } = v,
        row = {
          ...values,
          id: id ?? randomUUID(),
          householdId: home,
          connectionId: old?.connectionId ?? null,
          providerAccountId: old?.providerAccountId ?? null,
          revision: (old?.revision ?? 0) + 1,
          idempotencyKey: old?.idempotencyKey ?? submission,
          createdByUserId: old?.createdByUserId ?? actor,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        }
      if (old) db.update(bankAccounts).set(row).where(key(home, row.id)).run()
      else db.insert(bankAccounts).values(row).run()
      db.delete(bankAccountMembers)
        .where(
          and(eq(bankAccountMembers.accountId, row.id), eq(bankAccountMembers.householdId, home)),
        )
        .run()
      for (const memberId of memberIds)
        db.insert(bankAccountMembers)
          .values({ id: randomUUID(), householdId: home, accountId: row.id, memberId })
          .run()
      return accounts(home).find((a) => a.id === row.id)!
    },
    balance(
      home: string,
      accountId: string,
      v: Pick<Balance, 'currentCents' | 'availableCents' | 'observedAt' | 'notes'>,
      submission: string,
      source: Balance['source'] = 'manual',
      institutionAsOf: string | null = null,
    ) {
      const row = {
        ...v,
        id: randomUUID(),
        householdId: home,
        accountId,
        idempotencyKey: submission,
        source,
        institutionAsOf,
        createdAt: new Date().toISOString(),
      }
      db.insert(bankBalanceObservations).values(row).run()
      return row
    },
    audit(home: string, actor: string, target: string, action: string, details: unknown) {
      db.insert(bankAudit)
        .values({
          id: randomUUID(),
          householdId: home,
          actorUserId: actor,
          targetId: target,
          action,
          detailsJson: JSON.stringify(details),
          createdAt: new Date().toISOString(),
        })
        .run()
    },
    history(home: string, target: string) {
      return db
        .select()
        .from(bankAudit)
        .where(and(eq(bankAudit.householdId, home), eq(bankAudit.targetId, target)))
        .all()
    },
  }
}
export type BankRepository = ReturnType<typeof bankRepository>
