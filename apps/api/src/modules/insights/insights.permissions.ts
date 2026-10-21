import type { InsightSources, PublicUser, InsightRef } from '@goxfinance/shared'
import type { FinancialAccess } from '../households/financial-access'
import { plannerPermissions } from '../smart-planner/planner.permissions'
/** Filter before aggregation. A readable household ledger does not grant access to private-source analytics. */
export function scopedInsights(
  access: FinancialAccess,
  user: PublicUser,
  home: string,
  raw: InsightSources,
): InsightSources {
  const ctx = access.context(user, home)
  if (ctx.role === 'owner') return raw
  const member = ctx.self?.id,
    debts = raw.debts.filter((d) => d.memberAssignments.some((a) => a.memberId === member)),
    ids = new Set(debts.map((d) => d.id))
  const s: InsightSources = {
    ...raw,
    privacyLimited: true,
    debts,
    bills: raw.bills.filter(
      (b) =>
        b.memberIds.includes(member ?? '') &&
        (!b.linkedDebtId || ids.has(b.linkedDebtId)) &&
        b.periods.every((p) => !p.linkedDebtId || ids.has(p.linkedDebtId)),
    ),
    expenses: raw.expenses.filter((e) => e.responsibleMemberId === member),
    payments: raw.payments.filter((p) => ids.has(p.debtId)),
    balances: raw.balances.filter((b) => ids.has(b.debtId)),
    offers: raw.offers.filter((o) => ids.has(o.debtId)),
    budgets: raw.budgets?.filter((b) => b.responsibleMemberId === member),
    refunds: raw.refunds?.filter((r) => r.memberIds.includes(member ?? '')),
    income: {
      ...raw.income,
      sources: raw.income.sources.filter((src) => src.responsibleMemberId === member),
      transactions: raw.income.transactions.filter((t) =>
        raw.income.sources.some(
          (src) => src.id === t.sourceId && src.responsibleMemberId === member,
        ),
      ),
    },
    assets: raw.assets
      ? {
          ...raw.assets,
          assets: raw.assets.assets.filter(
            (a) => a.memberIds.includes(member ?? '') && a.debtIds.every((id) => ids.has(id)),
          ),
          debts,
          balances: raw.balances.filter((b) => ids.has(b.debtId)),
          valuations: raw.assets.valuations.filter((v) =>
            raw.assets!.assets.some(
              (a) =>
                a.id === v.assetId &&
                a.memberIds.includes(member ?? '') &&
                a.debtIds.every((id) => ids.has(id)),
            ),
          ),
        }
      : undefined,
    planner: {
      records: [],
      goals: raw.planner?.goals?.filter((g) => g.responsibleMemberId === member),
    },
  }
  const sourceIds = new Set(s.income.sources.map((src) => src.id))
  s.payroll = raw.payroll?.filter((w) => sourceIds.has(w.sourceId))
  // General Owner cash/reserve metadata must not leak through aggregate calculations.
  s.planner!.records = (raw.planner?.records ?? []).filter(
    (r) => r.createdByUserId === user.id && plannerPermissions(access).visible(r.values, s),
  )
  return s
}
export function authorizedInsightRef(ref: InsightRef, s: InsightSources) {
  if (ref.type === 'bank_balance' && ref.parentId)
    return !!s.cashAccounts?.some((a) => a.id === ref.parentId)
  const lists: Record<InsightRef['type'], { id: string }[]> = {
    expense: s.expenses.filter((e) => !e.voided),
    refund: s.refunds ?? [],
    settlement: s.offers,
    income: s.income.transactions,
    payroll: s.payroll ?? [],
    bill: s.bills,
    debt: s.debts,
    debt_payment: s.payments,
    debt_balance: s.balances,
    forecast_settings: (s.settingsIds ?? (s.settingsId ? [s.settingsId] : [])).map((id) => ({
      id,
    })),
    bank_balance: (s.cashAccounts ?? []).flatMap((a) => (a.balance ? [a.balance] : [])),
    budget: s.budgets ?? [],
    planner: s.planner?.records ?? [],
    goal: s.planner?.goals ?? [],
    asset: s.assets?.assets ?? [],
  }
  return lists[ref.type].some((r) => r.id === ref.id)
}
