import type { PublicUser } from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
import type { BankRepository } from './bank.repository'
export function bankPermissions(access: FinancialAccess, store: BankRepository) {
  function context(user: Pick<PublicUser, 'id'>, home: string) {
    const ctx = access.context(user, home)
    if (ctx.role !== 'owner' && !ctx.self)
      throw new FinancialError('An active linked member is required', 403)
    return ctx
  }
  return {
    context,
    owner(user: Pick<PublicUser, 'id'>, home: string) {
      const ctx = context(user, home)
      if (ctx.role !== 'owner')
        throw new FinancialError(
          'Only the household Owner may manage bank accounts and connections',
          403,
        )
      return ctx
    },
    account(user: Pick<PublicUser, 'id'>, home: string, id: string, write = false) {
      const ctx = context(user, home),
        row = store.accounts(home).find((a) => a.id === id)
      if (!row || (ctx.role !== 'owner' && !row.memberIds.includes(ctx.self!.id)))
        throw new FinancialError('Bank account not found', 404)
      if (write && ctx.role === 'viewer') throw new FinancialError('Read-only bank access', 403)
      return row
    },
  }
}
export type BankPermissions = ReturnType<typeof bankPermissions>
