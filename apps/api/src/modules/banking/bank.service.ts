import { randomUUID } from 'node:crypto'
import {
  bankAccountSchema,
  bankBalanceSchema,
  createTradingSchema,
  editTradingSchema,
  type PublicUser,
  type BankAccount,
  type BankingData,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { BankPermissions } from './bank.permissions'
import type { BankRepository } from './bank.repository'
import type { AssetRepository } from '../assets/asset.repository'
import type { DebtService } from '../debts/debt.service'
export function bankService(
  store: BankRepository,
  access: BankPermissions,
  assets: AssetRepository,
  debts: DebtService,
) {
  function view(
    user: PublicUser,
    home: string,
    row: ReturnType<BankRepository['accounts']>[number],
  ): BankAccount {
    const connection = store.connections(home).find((c) => c.id === row.connectionId),
      profile = bankAccountSchema.parse(rowProfile(row))
    return {
      ...profile,
      id: row.id,
      householdId: home,
      connectionId: row.connectionId,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      connectionStatus: connection?.status ?? 'manual',
      lastSyncAt: connection?.lastSyncAt ?? null,
      balance: store.balances(home, row.id)[0] ?? null,
      canManage: access.context(user, home).role === 'owner',
    }
  }
  function rowProfile(row: ReturnType<BankRepository['accounts']>[number]) {
    return Object.fromEntries(
      Object.keys(bankAccountSchema.shape).map((k) => [k, row[k as keyof typeof row]]),
    )
  }
  return {
    view,
    list(user: PublicUser, home: string): BankingData {
      const ctx = access.context(user, home),
        accounts = store
          .accounts(home)
          .filter((a) => ctx.role === 'owner' || a.memberIds.includes(ctx.self!.id))
          .map((a) => view(user, home, a)),
        ids = new Set(accounts.map((a) => a.id)),
        tx = store.transactions(home).filter((t) => ids.has(t.accountId))
      return {
        accounts,
        connections:
          ctx.role === 'owner'
            ? store.connections(home).map((c) => ({
                id: c.id,
                institution: c.institution,
                environment: c.environment as 'sandbox' | 'production',
                status: c.status,
                errorCode: c.errorCode,
                lastSyncAt: c.lastSyncAt,
                revision: c.revision,
              }))
            : [],
        members:
          ctx.role === 'owner'
            ? ctx.people.map((p) => ({ id: p.id, name: p.fullName }))
            : ctx.people
                .filter((p) => p.id === ctx.self!.id)
                .map((p) => ({ id: p.id, name: p.fullName })),
        owner: ctx.role === 'owner',
        unreviewed: tx.filter(
          (t) => ['unreviewed', 'needs_review'].includes(t.reviewStatus) && !t.removed,
        ).length,
        reconciled: tx.filter((t) => t.reviewStatus === 'reconciled').length,
        unmatchedInflows: tx.filter(
          (t) => t.reviewStatus === 'unreviewed' && !t.pending && !t.removed && t.amountCents > 0,
        ).length,
        unmatchedOutflows: tx.filter(
          (t) => t.reviewStatus === 'unreviewed' && !t.pending && !t.removed && t.amountCents < 0,
        ).length,
      }
    },
    save(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const ctx = access.owner(user, home),
          p = id
            ? editTradingSchema(bankAccountSchema).parse(body)
            : createTradingSchema(bankAccountSchema).parse(body),
          old = id ? access.account(user, home, id) : undefined
        if (old && ('revision' in p ? p.revision : 0) !== old.revision)
          throw new FinancialError('Bank account changed. Refresh before saving.', 409)
        for (const member of p.values.memberIds)
          if (!ctx.people.some((m) => m.id === member && m.status === 'active'))
            throw new FinancialError('Select active household members', 400)
        if (p.values.assetId) {
          if (p.values.type === 'credit_card')
            throw new FinancialError('Credit accounts cannot be cash assets', 400)
          if (!assets.all(home).some((a) => a.id === p.values.assetId))
            throw new FinancialError('Asset not found', 404)
        }
        if (p.values.debtId) {
          if (p.values.type !== 'credit_card')
            throw new FinancialError('Only credit accounts may map to a debt', 400)
          debts.get(user, home, p.values.debtId)
        }
        if (
          store
            .accounts(home)
            .some(
              (a) =>
                a.id !== id &&
                ((p.values.assetId && a.assetId === p.values.assetId) ||
                  (p.values.debtId && a.debtId === p.values.debtId)),
            )
        )
          throw new FinancialError(
            'That asset or liability is already mapped to another bank account',
            409,
          )
        if ('idempotencyKey' in p) {
          const prior = store.accounts(home).find((a) => a.idempotencyKey === p.idempotencyKey)
          if (prior) {
            if (
              prior.createdByUserId !== user.id ||
              JSON.stringify(rowProfile(prior)) !== JSON.stringify(p.values)
            )
              throw new FinancialError('Submission key already used', 409)
            return view(user, home, prior)
          }
        }
        const saved = store.write(
          home,
          user.id,
          p.values,
          'idempotencyKey' in p ? p.idempotencyKey : randomUUID(),
          id,
        )
        store.audit(home, user.id, saved.id, old ? 'account_updated' : 'account_created', {
          revision: saved.revision,
          profile: p.values,
        })
        return view(user, home, saved)
      })
    },
    observe(user: PublicUser, home: string, id: string, body: unknown) {
      return store.atomic(() => {
        access.owner(user, home)
        access.account(user, home, id)
        const p = createTradingSchema(bankBalanceSchema).parse(body)
        if (Date.parse(p.values.observedAt) > Date.now())
          throw new FinancialError('Future balances are not current observations', 400)
        const old = store
          .balances(home, id)
          .find(
            (b) => (b as typeof b & { idempotencyKey: string }).idempotencyKey === p.idempotencyKey,
          )
        if (old) {
          if (
            ['currentCents', 'availableCents', 'observedAt', 'notes'].some(
              (k) => old[k as keyof typeof old] !== p.values[k as keyof typeof p.values],
            )
          )
            throw new FinancialError('Submission key already used', 409)
          return old
        }
        const row = store.balance(home, id, p.values, p.idempotencyKey)
        store.audit(home, user.id, id, 'balance_observed', { observationId: row.id })
        return row
      })
    },
    history(user: PublicUser, home: string, id: string) {
      access.account(user, home, id)
      return { audit: store.history(home, id), balances: store.balances(home, id) }
    },
  }
}
export type BankService = ReturnType<typeof bankService>
