import type { PublicUser } from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
export function incomePermissions(access: FinancialAccess) {
  return {
    context: access.context,
    canManage(user: PublicUser, home: string, memberId: string) {
      const ctx = access.context(user, home)
      const member = ctx.people.find((v) => v.id === memberId)
      return (
        ctx.role === 'owner' ||
        (ctx.role !== 'viewer' &&
          member?.linkedUserId !== ctx.home.createdByUserId &&
          memberId === ctx.self?.id)
      )
    },
    manage(user: PublicUser, home: string, memberId: string, existing = false) {
      const ctx = access.context(user, home),
        member = ctx.people.find((v) => v.id === memberId)
      if (!this.canManage(user, home, memberId))
        throw new FinancialError('You cannot manage this income record', 403)
      if (!member || (!existing && member.status !== 'active'))
        throw new FinancialError('Select an active household member', 400)
    },
  }
}
export type IncomePermissions = ReturnType<typeof incomePermissions>
