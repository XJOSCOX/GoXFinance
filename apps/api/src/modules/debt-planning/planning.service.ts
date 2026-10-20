import {
  createTradingSchema,
  editTradingSchema,
  settlementSchema,
  payoffScenarioSchema,
  settlementProgress,
  localBillDate,
  type PublicUser,
  type DebtPayment,
} from '@goxfinance/shared'
import type { DebtService } from '../debts/debt.service'
import type { PaymentService } from '../debt-payments/payment.service'
import type { TradingPermissions } from '../trading/trading.permissions'
import { checkRevision } from '../trading/trading.permissions'
import { FinancialError } from '../households/financial-access'
import type { PlanningRepository } from './planning.repository'
export function planningService(
  store: PlanningRepository,
  access: TradingPermissions,
  debts: DebtService,
  payments: PaymentService,
) {
  const manage = (user: PublicUser, home: string, debtId: string) =>
    debts.authorizePayment(user, home, debtId, 'modify')
  return {
    list(user: PublicUser, home: string) {
      access.context(user, home)
      const all = debts.list(user, home).debts
      return {
        editableDebtIds: all
          .filter((d) => {
            try {
              manage(user, home, d.id)
              return true
            } catch {
              return false
            }
          })
          .map((d) => d.id),
        debts: all,
        payments: all.flatMap((d) => payments.list(user, home, d.id).payments),
        offers: store.offers(home).map((o) => {
          let canManage = false
          try {
            manage(user, home, o.debtId)
            canManage = true
          } catch {
            /* Display remains read-only. */
          }
          return { ...o, canManage }
        }),
        scenarios: store.scenarios(home),
        canSave: access.context(user, home).role !== 'viewer',
      }
    },
    offer(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        access.context(user, home)
        const p = id
            ? editTradingSchema(settlementSchema).parse(body)
            : createTradingSchema(settlementSchema).parse(body),
          old = id ? store.offers(home).find((o) => o.id === id) : undefined
        if (id && !old) throw new FinancialError('Offer not found', 404)
        if (old) {
          manage(user, home, old.debtId)
          checkRevision(old.revision, 'revision' in p ? p.revision : 0)
          if (old.debtId !== p.values.debtId)
            throw new FinancialError('An offer cannot move to another debt', 400)
        }
        const debt = manage(user, home, p.values.debtId)
        if ('idempotencyKey' in p) {
          const found = store.offers(home).find((o) => o.idempotencyKey === p.idempotencyKey)
          if (found) {
            if (
              found.createdByUserId !== user.id ||
              JSON.stringify(
                Object.fromEntries(
                  Object.keys(p.values).map((k) => [k, found[k as keyof typeof found]]),
                ),
              ) !== JSON.stringify(p.values)
            )
              throw new FinancialError('Submission key already used', 409)
            return found
          }
        }
        const allPayments = payments.list(user, home, debt.id).payments as DebtPayment[]
        for (const item of p.values.schedule)
          if (item.paymentId) {
            if (!allPayments.some((pay) => pay.id === item.paymentId))
              throw new FinancialError('Choose a payment on this household debt', 400)
            if (
              store
                .offers(home)
                .some((o) => o.id !== id && o.schedule.some((s) => s.paymentId === item.paymentId))
            )
              throw new FinancialError('Payment already linked to another offer', 409)
          }
        if (
          p.values.status === 'completed' &&
          (debt.paymentStatus !== 'settled' ||
            debt.currentBalanceCents !== 0 ||
            debt.confidence !== 'confirmed' ||
            !debt.balanceVerifiedAt ||
            settlementProgress(p.values, allPayments, localBillDate()).remainingCents !== 0)
        )
          throw new FinancialError(
            'Verify settlement through Debt balance reconciliation and record completed payments before completing the offer',
            409,
          )
        const record = store.write(
          home,
          user.id,
          p.values,
          'idempotencyKey' in p ? p.idempotencyKey : old!.idempotencyKey,
          old,
        )
        store.audit(home, user.id, record.id, old ? 'offer_corrected' : 'offer_created', old, {
          record,
          ...('reason' in p ? { reason: p.reason } : {}),
        })
        return record
      })
    },
    scenario(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        const ctx = access.context(user, home)
        if (ctx.role === 'viewer') throw new FinancialError('Read-only access', 403)
        const p = createTradingSchema(payoffScenarioSchema).parse(body),
          all = debts.list(user, home).debts
        if (
          [...p.values.order, ...p.values.assumptions.map((a) => a.debtId)].some(
            (id) => !all.some((d) => d.id === id),
          )
        )
          throw new FinancialError('Debt not found in household', 400)
        const old = store.scenarios(home).find((s) => s.idempotencyKey === p.idempotencyKey)
        if (old) {
          if (
            old.createdByUserId !== user.id ||
            JSON.stringify(old.input) !== JSON.stringify(p.values)
          )
            throw new FinancialError('Submission key already used', 409)
          return old
        }
        const record = store.scenario(home, user.id, p.values, all, p.idempotencyKey)
        store.audit(home, user.id, record.id, 'scenario_saved', null, record)
        return record
      })
    },
    history(user: PublicUser, home: string, id: string) {
      access.context(user, home)
      if (
        !store.offers(home).some((r) => r.id === id) &&
        !store.scenarios(home).some((r) => r.id === id)
      )
        throw new FinancialError('Record not found', 404)
      return store.history(home, id)
    },
  }
}
export type PlanningService = ReturnType<typeof planningService>
