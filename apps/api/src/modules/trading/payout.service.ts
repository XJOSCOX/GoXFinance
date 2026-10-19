import { randomUUID } from 'node:crypto'
import {
  incomeTransactionSchema,
  tradingPayoutSchema,
  createTradingSchema,
  editTradingSchema,
  localBillDate,
  type PublicUser,
  type TradingPayoutInput,
  type TradingPayout,
} from '@goxfinance/shared'
import type { IncomeService } from '../income/income.service'
import { FinancialError } from '../households/financial-access'
import { checkRevision, type TradingPermissions } from './trading.permissions'
import type { TradingRepository, TradingAccountRow } from './trading.repository'
import type { TradingService } from './trading.service'
export function payoutService(
  store: TradingRepository,
  trading: TradingService,
  permissions: TradingPermissions,
  income: IncomeService,
) {
  function receipt(
    user: PublicUser,
    home: string,
    account: TradingAccountRow,
    id: string,
    v: TradingPayoutInput,
    old?: ReturnType<TradingRepository['payouts']>[number],
  ) {
    if (old?.incomeTransactionId) {
      const tx = income.list(user, home).transactions.find((t) => t.id === old.incomeTransactionId)
      if (!tx) throw new FinancialError('Linked income is missing', 409)
      const values = incomeTransactionSchema.parse(
        Object.fromEntries(
          Object.keys(incomeTransactionSchema.shape).map((key) => [
            key,
            tx[key as keyof typeof tx],
          ]),
        ),
      )
      income.editTransaction(
        user,
        home,
        tx.id,
        {
          revision: tx.revision,
          reason: 'Trading payout correction',
          values: {
            ...values,
            status: v.status === 'paid' ? 'confirmed' : 'cancelled',
            actualNetCents: v.status === 'paid' ? v.receivedCents : tx.actualNetCents,
            depositDate: v.status === 'paid' ? v.depositDate : tx.depositDate,
            receiptConfirmed: true,
            tradingPayoutWithdrawn: true,
          },
        },
        true,
      )
      return v.status === 'paid' ? tx.id : null
    }
    if (v.status !== 'paid') return null
    if (v.existingIncomeTransactionId) {
      const tx = income
        .list(user, home)
        .transactions.find((t) => t.id === v.existingIncomeTransactionId)
      if (
        !tx ||
        tx.status !== 'confirmed' ||
        tx.incomeTypeSnapshot !== 'trading_payout' ||
        !tx.tradingPayoutWithdrawn ||
        tx.responsibleMemberId !== account.responsibleMemberId ||
        tx.actualNetCents !== v.receivedCents ||
        tx.depositDate !== v.depositDate ||
        store.payouts(home).some((p) => p.incomeTransactionId === tx.id)
      )
        throw new FinancialError(
          'Select an unlinked confirmed trading deposit with the same member, amount and date',
          409,
        )
      return tx.id
    }
    let sourceId = account.incomeSourceId
    if (!sourceId) {
      sourceId = income.createSource(user, home, {
        idempotencyKey: account.id,
        values: {
          responsibleMemberId: account.responsibleMemberId,
          name: `Topstep - ${account.nickname}`,
          incomeType: 'trading_payout',
          frequency: 'irregular',
          hourlyRateCents: null,
          expectedGrossCents: null,
          expectedNetCents: null,
          payday: null,
          overtimeMultiplier: '1',
          status: 'active',
          notes: 'Confirmed deposited payouts only.',
        },
      }).id
      store.writeAccount(
        {
          ...account,
          incomeSourceId: sourceId,
          revision: account.revision + 1,
          updatedAt: new Date().toISOString(),
        },
        true,
      )
    }
    return income.createTransaction(user, home, {
      idempotencyKey: id,
      values: {
        sourceId,
        workPeriodStart: null,
        workPeriodEnd: null,
        regularHours: null,
        overtimeHours: null,
        hourlyRateCents: null,
        overtimeMultiplier: '1',
        expectedGrossCents: null,
        expectedNetCents: null,
        actualGrossCents: null,
        deductionsCents: null,
        actualNetCents: v.receivedCents,
        payDate: v.depositDate,
        depositDate: v.depositDate,
        status: 'confirmed',
        reference: `Topstep payout ${id}`,
        notes: v.notes,
        receiptConfirmed: true,
        tradingPayoutWithdrawn: true,
      },
    }).id
  }
  return {
    list(user: PublicUser, home: string): TradingPayout[] {
      permissions.context(user, home)
      return store.payouts(home).map((p) => ({
        ...p,
        canManage: permissions.canManage(
          user,
          home,
          trading.account(user, home, p.accountId).responsibleMemberId,
        ),
      })) as TradingPayout[]
    },
    save(user: PublicUser, home: string, body: unknown, id?: string, batchId?: string) {
      return store.atomic(() => {
        const parsed = id
            ? editTradingSchema(tradingPayoutSchema).parse(body)
            : createTradingSchema(tradingPayoutSchema).parse(body),
          v = parsed.values
        const parent = trading.account(user, home, v.accountId)
        permissions.manage(user, home, parent.responsibleMemberId, true)
        const old = id ? store.payouts(home).find((p) => p.id === id) : undefined
        if (id && !old) throw new FinancialError('Payout not found', 404)
        if ('idempotencyKey' in parsed) {
          const previous = store
            .payouts(home)
            .find((p) => p.idempotencyKey === parsed.idempotencyKey)
          if (trading.replay(home, user.id, previous, v)) return previous
        }
        if (parent.deletedAt && !id)
          throw new FinancialError('Restore this account before adding payouts', 409)
        if (old) {
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
          if (old.accountId !== v.accountId)
            throw new FinancialError('Payout account cannot change', 409)
          if (['cancelled', 'rejected'].includes(old.status))
            throw new FinancialError(
              'Terminal payouts are retained for history; create a new request',
              409,
            )
          if (old.status === 'paid' && !['paid', 'cancelled'].includes(v.status))
            throw new FinancialError('A paid payout can only be corrected or cancelled', 409)
          if (
            old.incomeTransactionId &&
            v.status === 'paid' &&
            v.existingIncomeTransactionId !== old.existingIncomeTransactionId
          )
            throw new FinancialError('An existing income link cannot be replaced', 409)
        }
        if (v.requestDate > localBillDate() || (v.depositDate && v.depositDate > localBillDate()))
          throw new FinancialError(
            'Record external requests and deposits only after they occur',
            400,
          )
        if (
          v.reference &&
          store
            .payouts(home)
            .some((p) => p.id !== id && p.reference?.toLowerCase() === v.reference?.toLowerCase())
        )
          throw new FinancialError('Payout reference already recorded', 409)
        if (
          !old &&
          store
            .payouts(home)
            .some(
              (p) =>
                p.accountId === v.accountId &&
                p.requestDate === v.requestDate &&
                p.requestedCents === v.requestedCents &&
                !['cancelled', 'rejected'].includes(p.status) &&
                (!p.reference || !v.reference),
            )
        )
          throw new FinancialError(
            'A matching payout request exists. Update it, or provide distinct external references for separate requests.',
            409,
          )
        const target = id ?? randomUUID(),
          now = new Date().toISOString()
        const incomeTransactionId = receipt(user, home, parent, target, v, old)
        const row = {
          ...old,
          ...v,
          existingIncomeTransactionId:
            v.status === 'cancelled' && old?.incomeTransactionId
              ? old.incomeTransactionId
              : v.existingIncomeTransactionId,
          id: target,
          householdId: home,
          batchId: old?.batchId ?? batchId ?? null,
          incomeTransactionId,
          createdByUserId: old?.createdByUserId ?? user.id,
          idempotencyKey:
            old?.idempotencyKey ??
            ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
          revision: (old?.revision ?? 0) + 1,
        }
        store.writePayout(row, !!old)
        store.audit(home, user.id, old ? 'payout_corrected' : 'payout_created', target, old, row, v)
        return row
      })
    },
  }
}
export type PayoutService = ReturnType<typeof payoutService>
