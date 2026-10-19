import { randomUUID } from 'node:crypto'
import { createTradingSchema, payoutBatchSchema, type PublicUser } from '@goxfinance/shared'
import type { CopyRepository } from './copy.repository'
import type { TradingRepository } from './trading.repository'
import type { TradingService } from './trading.service'
import type { PayoutService } from './payout.service'
import type { TradingPermissions } from './trading.permissions'
export function payoutBatchService(
  store: CopyRepository,
  trades: TradingRepository,
  trading: TradingService,
  payouts: PayoutService,
  permissions: TradingPermissions,
) {
  const manage = (user: PublicUser, home: string, ids: string[]) =>
    ids.forEach((id) =>
      permissions.manage(user, home, trading.account(user, home, id).responsibleMemberId, true),
    )
  return {
    createBatch(user: PublicUser, home: string, body: unknown) {
      return trades.atomic(() => {
        const { values: v, idempotencyKey } = createTradingSchema(payoutBatchSchema).parse(body)
        permissions.context(user, home)
        manage(
          user,
          home,
          v.entries.map((e) => e.accountId),
        )
        const previous = store.batches(home).find((b) => b.idempotencyKey === idempotencyKey)
        if (trading.replay(home, user.id, previous, v)) return previous
        const id = randomUUID(),
          now = new Date().toISOString(),
          row = {
            id,
            householdId: home,
            name: v.name,
            requestDate: v.requestDate,
            notes: v.notes,
            idempotencyKey,
            createdByUserId: user.id,
            createdAt: now,
            updatedAt: now,
            revision: 1,
          }
        store.createBatch(row)
        for (const entry of v.entries)
          payouts.save(
            user,
            home,
            {
              idempotencyKey: randomUUID(),
              values: {
                ...entry,
                requestDate: v.requestDate,
                status: 'requested',
                approvedCents: null,
                receivedCents: null,
                depositDate: null,
                reference: null,
                notes: v.notes,
                receiptConfirmed: false,
                existingIncomeTransactionId: null,
              },
            },
            undefined,
            id,
          )
        trades.audit(home, user.id, 'batch_created', id, null, row, v)
        return row
      })
    },
  }
}
export type PayoutBatchService = ReturnType<typeof payoutBatchService>
