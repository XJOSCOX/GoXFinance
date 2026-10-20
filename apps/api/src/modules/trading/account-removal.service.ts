import { z } from 'zod'
import type { PublicUser, TradingAccount } from '@goxfinance/shared'
import type { TradingRepository, TradingAccountRow } from './trading.repository'
import { checkRevision, type TradingPermissions } from './trading.permissions'
import { FinancialError } from '../households/financial-access'

type Dependencies = {
  store: TradingRepository
  permissions: TradingPermissions
  account: (user: PublicUser, home: string, id: string) => TradingAccountRow
  accountView: (user: PublicUser, home: string, row: TradingAccountRow) => TradingAccount
}
export function setAccountDeleted(
  { store, permissions, account, accountView }: Dependencies,
  user: PublicUser,
  home: string,
  id: string,
  body: unknown,
  deleted: boolean,
) {
  return store.atomic(() => {
    const input = z
      .object({ revision: z.number().int().positive(), permanent: z.boolean().optional() })
      .strict()
      .parse(body)
    const old = account(user, home, id)
    permissions.manage(user, home, old.responsibleMemberId, true)
    checkRevision(old.revision, input.revision)
    if (old.permanentlyDeletedAt)
      throw new FinancialError('This account was permanently removed and cannot be restored', 409)
    if (input.permanent) {
      if (!deleted) throw new FinancialError('Permanent deletion is not a restore operation', 400)
      if (old.incomeSourceId || store.payouts(home).some((p) => p.accountId === id))
        throw new FinancialError(
          'Accounts with any payout history cannot be permanently deleted. Hide it instead.',
          409,
        )
      // Retain a non-restorable tombstone when referenced by journals, groups or goals.
      // Foreign keys and audit snapshots remain intact; reports exclude retired results.
      if (store.hasAccountHistory(home, id)) {
        const now = new Date().toISOString()
        store.writeAccount(
          {
            ...old,
            deletedAt: now,
            permanentlyDeletedAt: now,
            updatedAt: now,
            revision: old.revision + 1,
          },
          true,
        )
      } else store.removeAccount(home, id)
      store.audit(home, user.id, 'account_permanently_deleted', id, old, null)
      store.audit(home, user.id, 'account_submission_retired', old.idempotencyKey, null, { id })
      return null
    }
    if (!!old.deletedAt === deleted) return accountView(user, home, old)
    const now = new Date().toISOString()
    const row = {
      ...old,
      deletedAt: deleted ? now : null,
      updatedAt: now,
      revision: old.revision + 1,
    }
    store.writeAccount(row, true)
    store.audit(home, user.id, deleted ? 'account_deleted' : 'account_restored', id, old, row)
    return accountView(user, home, row)
  })
}
