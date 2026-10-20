import {
  createIncomeSourceSchema,
  editIncomeSourceSchema,
  incomeSourceSchema,
  createIncomeTransactionSchema,
  editIncomeTransactionSchema,
  incomeTransactionSchema,
  type PublicUser,
  type IncomeSource,
  type IncomeTransaction,
  type IncomeTransactionInput,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { IncomeRepository, SourceRow, TransactionRow } from './income.repository'
import type { IncomePermissions } from './income.permissions'
import { transactionValues } from './income-transactions'
import { randomUUID } from 'node:crypto'

export function incomeService(
  store: IncomeRepository,
  permissions: IncomePermissions,
  linkedGuard: (home: string, id: string) => void = () => {},
  payrollHooks?: {
    validate: (home: string, id: string, values: IncomeTransactionInput) => void
    after: (user: PublicUser, home: string, row: IncomeTransaction) => void
  },
) {
  const sourceView = (user: PublicUser, home: string, row: SourceRow): IncomeSource => ({
    ...row,
    incomeType: row.incomeType as IncomeSource['incomeType'],
    frequency: row.frequency as IncomeSource['frequency'],
    status: row.status as IncomeSource['status'],
    canManage: permissions.canManage(user, home, row.responsibleMemberId),
  })
  const transactionView = (
    user: PublicUser,
    home: string,
    row: TransactionRow,
  ): IncomeTransaction => ({
    ...row,
    ...incomeTransactionSchema.parse(
      Object.fromEntries(
        Object.keys(incomeTransactionSchema.shape).map((k) => [k, row[k as keyof TransactionRow]]),
      ),
    ),
    incomeTypeSnapshot: row.incomeTypeSnapshot as IncomeTransaction['incomeTypeSnapshot'],
    frequencySnapshot: row.frequencySnapshot as IncomeTransaction['frequencySnapshot'],
    canManage: permissions.canManage(user, home, row.responsibleMemberId),
  })
  function source(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const row = store.source(home, id)
    if (!row) throw new FinancialError('Income source not found', 404)
    return row
  }
  function transaction(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const row = store.transaction(home, id)
    if (!row) throw new FinancialError('Income transaction not found', 404)
    return row
  }
  const stale = (actual: number, expected: number) => {
    if (actual !== expected)
      throw new FinancialError('This record changed. Refresh before correcting it.', 409)
  }
  return {
    list(user: PublicUser, home: string) {
      const ctx = permissions.context(user, home)
      return {
        sources: store.sources(home).map((v) => sourceView(user, home, v)),
        transactions: store.transactions(home).map((v) => transactionView(user, home, v)),
        canCreate: ctx.role !== 'viewer' && (ctx.role === 'owner' || !!ctx.self),
      }
    },
    get(user: PublicUser, home: string, id: string) {
      return {
        source: sourceView(user, home, source(user, home, id)),
        audit: store.history(home, id),
      }
    },
    createSource(user: PublicUser, home: string, body: unknown) {
      const { values, idempotencyKey } = createIncomeSourceSchema.parse(body)
      return store.atomic(() => {
        permissions.manage(user, home, values.responsibleMemberId)
        const old = store.sourceKey(home, idempotencyKey)
        if (old) {
          if (
            old.createdByUserId !== user.id ||
            JSON.stringify(
              incomeSourceSchema.parse(
                Object.fromEntries(
                  Object.keys(incomeSourceSchema.shape).map((k) => [k, old[k as keyof SourceRow]]),
                ),
              ),
            ) !== JSON.stringify(values)
          )
            throw new FinancialError('Submission key already used', 409)
          return sourceView(user, home, old)
        }
        const row = store.createSource(home, user.id, idempotencyKey, values)
        store.audit(home, row.id, null, user.id, 'source_created', null, row)
        return sourceView(user, home, row)
      })
    },
    editSource(user: PublicUser, home: string, id: string, body: unknown) {
      const { values, revision, reason } = editIncomeSourceSchema.parse(body)
      return store.atomic(() => {
        const old = source(user, home, id)
        permissions.manage(user, home, old.responsibleMemberId, true)
        permissions.manage(
          user,
          home,
          values.responsibleMemberId,
          values.responsibleMemberId === old.responsibleMemberId,
        )
        stale(old.revision, revision)
        if (old.isArchived) throw new FinancialError('Restore the source before editing it', 409)
        if (
          old.responsibleMemberId !== values.responsibleMemberId &&
          store.transactions(home).some((v) => v.sourceId === id)
        )
          throw new FinancialError(
            'Sources with pay history cannot be reassigned. Create a new source for the other earner.',
            409,
          )
        const row = store.updateSource(home, id, revision, values)
        store.audit(home, id, null, user.id, 'source_corrected', old, row, reason)
        return sourceView(user, home, row)
      })
    },
    archive(user: PublicUser, home: string, id: string, revision: number, isArchived: boolean) {
      return store.atomic(() => {
        const old = source(user, home, id)
        permissions.manage(user, home, old.responsibleMemberId, true)
        stale(old.revision, revision)
        const row = store.updateSource(home, id, revision, { isArchived })
        store.audit(
          home,
          id,
          null,
          user.id,
          isArchived ? 'source_archived' : 'source_restored',
          old,
          row,
        )
        return sourceView(user, home, row)
      })
    },
    createTransaction(user: PublicUser, home: string, body: unknown) {
      const { values, idempotencyKey } = createIncomeTransactionSchema.parse(body)
      return store.atomic(() => {
        const parent = source(user, home, values.sourceId)
        permissions.manage(user, home, parent.responsibleMemberId)
        const old = store.transactionSubmission(home, idempotencyKey)
        if (old) {
          if (
            old.createdByUserId !== user.id ||
            JSON.stringify(
              incomeTransactionSchema.parse(
                Object.fromEntries(
                  Object.keys(incomeTransactionSchema.shape).map((k) => [
                    k,
                    old[k as keyof TransactionRow],
                  ]),
                ),
              ),
            ) !== JSON.stringify(values)
          )
            throw new FinancialError('Submission key already used', 409)
          return transactionView(user, home, old)
        }
        if (parent.isArchived || parent.status !== 'active')
          throw new FinancialError('Select an active income source', 400)
        const fields = transactionValues(store, home, parent, values),
          now = new Date().toISOString()
        const row = store.createTransaction(home, user.id, idempotencyKey, {
          ...fields,
          id: randomUUID(),
          householdId: home,
          createdByUserId: user.id,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        store.audit(
          home,
          parent.id,
          row.id,
          user.id,
          values.status === 'confirmed' ? 'income_confirmed' : 'income_recorded',
          null,
          row,
        )
        return transactionView(user, home, row)
      })
    },
    editTransaction(
      user: PublicUser,
      home: string,
      id: string,
      body: unknown,
      fromTrading = false,
      fromPayroll = false,
    ) {
      const { values, revision, reason } = editIncomeTransactionSchema.parse(body)
      return store.atomic(() => {
        const old = transaction(user, home, id)
        if (!fromPayroll) payrollHooks?.validate(home, id, values)
        if (!fromTrading) linkedGuard(home, id)
        permissions.manage(user, home, old.responsibleMemberId, true)
        stale(old.revision, revision)
        const parent = source(user, home, old.sourceId),
          fields = transactionValues(store, home, parent, values, old)
        const row = store.updateTransaction(home, id, revision, fields)
        store.audit(
          home,
          parent.id,
          id,
          user.id,
          values.status === 'cancelled'
            ? 'income_cancelled'
            : values.status === 'confirmed' && old.status !== 'confirmed'
              ? 'income_confirmed'
              : 'income_corrected',
          old,
          row,
          reason,
        )
        const saved = transactionView(user, home, row)
        if (!fromPayroll) payrollHooks?.after(user, home, saved)
        return saved
      })
    },
  }
}
export type IncomeService = ReturnType<typeof incomeService>
