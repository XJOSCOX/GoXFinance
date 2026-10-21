import type { ForecastSources, PlannerInput, PlannerTarget, PublicUser } from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
// Planning never grants access to the underlying financial record.
export function plannerPermissions(access: FinancialAccess) {
  function targetMembers(target: PlannerTarget, s: ForecastSources): string[] {
    if (target.kind === 'bill' || target.kind === 'bill_period') {
      const b = s.bills.find((b) =>
        target.kind === 'bill' ? b.id === target.id : b.periods.some((p) => p.id === target.id),
      )
      if (!b) throw new FinancialError('Bill not found', 404)
      if (target.parentId && target.parentId !== b.id)
        throw new FinancialError('Bill parent does not match', 400)
      const linked = s.debts.filter(
        (d) => d.id === b.linkedDebtId || b.periods.some((p) => p.linkedDebtId === d.id),
      )
      return [
        ...new Set([
          ...b.memberIds,
          ...linked.flatMap((d) => d.memberAssignments.map((a) => a.memberId)),
        ]),
      ]
    }
    if (target.kind === 'debt' || target.kind === 'settlement') {
      const id =
          target.kind === 'settlement'
            ? s.offers.find((o) => o.id === target.id)?.debtId
            : target.id,
        d = s.debts.find((d) => d.id === id)
      if (!d) throw new FinancialError('Debt not found', 404)
      return d.memberAssignments.map((a) => a.memberId)
    }
    if (target.kind === 'expense') {
      const e = s.expenses.find((e) => e.id === target.id)
      if (!e) throw new FinancialError('Expense not found', 404)
      return [e.responsibleMemberId]
    }
    const g = s.planner?.goals?.find((g) => g.id === target.id)
    if (!g) throw new FinancialError('Goal not found', 404)
    return g.responsibleMemberId ? [g.responsibleMemberId] : []
  }
  function visible(v: PlannerInput, s: ForecastSources) {
    if (v.kind === 'advance' && v.sourceId && !s.income.sources.some((i) => i.id === v.sourceId))
      return false
    const accounts =
      v.kind === 'preferences'
        ? v.accountIds
        : 'accountId' in v && v.accountId
          ? [v.accountId]
          : v.kind === 'priority' && v.paymentAccountId
            ? [v.paymentAccountId]
            : []
    if (accounts.some((id) => !s.cashAccounts?.some((a) => a.id === id))) return false
    try {
      if ('target' in v && v.target) targetMembers(v.target, s)
      if (v.kind === 'arrangement' && v.expenseId && !s.expenses.some((e) => e.id === v.expenseId))
        return false
      if (v.kind === 'allocation' && v.goalId && !s.planner?.goals?.some((g) => g.id === v.goalId))
        return false
      return true
    } catch {
      return false
    }
  }
  function manage(user: PublicUser, home: string, v: PlannerInput, s: ForecastSources) {
    const ctx = access.context(user, home)
    if (ctx.role === 'viewer' || !visible(v, s))
      throw new FinancialError('You cannot manage this planning record', 403)
    if (ctx.role === 'owner') return { requiresApproval: false }
    // Household-wide cash, reserves and bank observations remain Owner controlled.
    if (v.kind === 'balance' || v.kind === 'preferences' || !('target' in v) || !v.target)
      throw new FinancialError('Only the Owner can manage household cash or general reserves', 403)
    const members = targetMembers(v.target, s),
      owner = ctx.people.find((p) => p.linkedUserId === ctx.home.createdByUserId)?.id
    const bill =
      v.target.kind === 'bill' || v.target.kind === 'bill_period'
        ? s.bills.find((b) => b.id === v.target!.id || b.periods.some((p) => p.id === v.target!.id))
        : null
    if (
      bill &&
      owner &&
      (bill.memberIds.every((id) => id === owner) ||
        s.debts.some(
          (d) =>
            (d.id === bill.linkedDebtId || bill.periods.some((p) => p.linkedDebtId === d.id)) &&
            d.memberAssignments.every((a) => a.memberId === owner),
        ))
    )
      throw new FinancialError(
        'Owner-exclusive obligations cannot be managed by other members',
        403,
      )
    if (
      !ctx.self ||
      !members.includes(ctx.self.id) ||
      members.length === 0 ||
      members.every((id) => id === owner)
    )
      throw new FinancialError('You cannot manage this obligation', 403)
    return { requiresApproval: !!owner && members.includes(owner) }
  }
  return { context: access.context, visible, manage, targetMembers }
}
export type PlannerPermissions = ReturnType<typeof plannerPermissions>
