import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Debt, DebtValues } from '@goxfinance/shared'
import type { DatabaseConnection } from '../../db/connection'
import { debtBalanceHistory, debtMembers, debts } from '../../../../../packages/db/src/schema'

export function debtRepository(db: DatabaseConnection) {
  function hydrate(row: typeof debts.$inferSelect): Debt {
    const members = db.select().from(debtMembers).where(eq(debtMembers.debtId, row.id)).all()
    return { ...row, memberAssignments: members.map(member => ({ memberId: member.householdMemberId,
      responsibility: member.responsibility as Debt['memberAssignments'][number]['responsibility'] })) } as Debt
  }
  const key = (householdId: string, id: string) => and(eq(debts.householdId, householdId), eq(debts.id, id))
  return {
    list(householdId: string) {
      return db.select().from(debts).where(eq(debts.householdId, householdId)).all().map(hydrate)
    },
    find(householdId: string, id: string) {
      const row = db.select().from(debts).where(key(householdId, id)).get()
      return row ? hydrate(row) : undefined
    },
    create(householdId: string, createdByUserId: string, values: DebtValues) {
      const id = randomUUID()
      const now = new Date().toISOString()
      const { memberAssignments, ...fields } = values
      db.transaction(tx => {
        tx.insert(debts).values({ id, householdId, createdByUserId, ...fields, createdAt: now, updatedAt: now }).run()
        if (fields.currentBalanceCents !== null) tx.insert(debtBalanceHistory).values({ id: randomUUID(), householdId, debtId: id,
          balanceCents: fields.currentBalanceCents, effectiveDate: fields.balanceVerifiedAt?.slice(0, 10) ?? now.slice(0, 10),
          source: 'initial', recordedByUserId: createdByUserId, notes: fields.balanceVerifiedAt ? 'Initial verified account balance' : 'Initial entry; creditor verification date not supplied', createdAt: now }).run()
        for (const member of memberAssignments) tx.insert(debtMembers).values({ debtId: id, householdId,
          householdMemberId: member.memberId, responsibility: member.responsibility, createdAt: now }).run()
      })
      return this.find(householdId, id)!
    },
    update(householdId: string, id: string, values: DebtValues) {
      const now = new Date().toISOString()
      const { memberAssignments, ...fields } = values
      db.transaction(tx => {
        tx.update(debts).set({ ...fields, updatedAt: now }).where(key(householdId, id)).run()
        tx.delete(debtMembers).where(and(eq(debtMembers.householdId, householdId), eq(debtMembers.debtId, id))).run()
        for (const member of memberAssignments) tx.insert(debtMembers).values({ debtId: id, householdId,
          householdMemberId: member.memberId, responsibility: member.responsibility, createdAt: now }).run()
      })
      return this.find(householdId, id)!
    },
    setArchived(householdId: string, id: string, isArchived: boolean) {
      db.update(debts).set({ isArchived, updatedAt: new Date().toISOString() }).where(key(householdId, id)).run()
      return this.find(householdId, id)!
    },
  }
}

export type DebtRepository = ReturnType<typeof debtRepository>
