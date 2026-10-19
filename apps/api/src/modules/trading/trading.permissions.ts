import type { PublicUser } from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
export function tradingPermissions(access: FinancialAccess) {
  function canManage(user: PublicUser, home: string, member: string | null) {
    const ctx = access.context(user, home)
    return (
      ctx.role === 'owner' ||
      (ctx.role !== 'viewer' &&
        member !== null &&
        ctx.self?.id === member &&
        ctx.self.linkedUserId !== ctx.home.createdByUserId)
    )
  }
  return {
    context: access.context,
    canManage,
    manage(user: PublicUser, home: string, member: string | null, existing = false) {
      if (!canManage(user, home, member))
        throw new FinancialError('You cannot manage this financial record', 403)
      if (
        member !== null &&
        !access
          .context(user, home)
          .people.some((p) => p.id === member && (existing || p.status === 'active'))
      )
        throw new FinancialError('Select an active household member', 400)
    },
  }
}
export type TradingPermissions = ReturnType<typeof tradingPermissions>
export function checkRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new FinancialError('This record changed. Refresh before saving.', 409)
}
