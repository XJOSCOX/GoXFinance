import type { PublicUser, ReportFilters, ReportOptions } from '@goxfinance/shared'
import type { FinancialAccess } from '../households/financial-access'
import { FinancialError } from '../households/financial-access'
import type { ReportSources } from './report.sources'
export function reportScope(
  access: FinancialAccess,
  user: PublicUser,
  home: string,
  source: ReportSources,
  filters?: ReportFilters,
) {
  const ctx = access.context(user, home),
    owner = ctx.role === 'owner',
    self = ctx.self?.id ?? null
  if (!owner && !self)
    throw new FinancialError('An active linked household member is required', 403)
  if (!owner && filters?.memberId && filters.memberId !== self)
    throw new FinancialError('Only your associated records may be exported', 403)
  const member = filters?.memberId ?? (owner ? null : self)
  const associated = (ids: string[]) => !member || ids.includes(member)
  const debts = source.debts.filter((d) => associated(d.memberAssignments.map((a) => a.memberId))),
    debtIds = new Set(debts.map((d) => d.id))
  const accounts = source.accounts.filter((a) =>
      associated(a.responsibleMemberId ? [a.responsibleMemberId] : []),
    ),
    accountIds = new Set(accounts.map((a) => a.id))
  const groups = source.groups.filter((g) => g.members.every((m) => accountIds.has(m.accountId)))
  const options: ReportOptions = {
    owner,
    selfId: self,
    members: ctx.people
      .filter((p) => owner || p.id === self)
      .map((p) => ({ id: p.id, name: p.fullName })),
    categories: source.categories.map((c) => ({ id: c.id, name: c.name })),
    debts: debts.map((d) => ({ id: d.id, name: d.creditorName })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.nickname })),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
  }
  for (const [key, rows] of [
    ['debtId', options.debts],
    ['accountId', options.accounts],
    ['groupId', options.groups],
    ['categoryId', options.categories],
    ['memberId', options.members],
  ] as const) {
    if (filters?.[key] && !rows.some((r) => r.id === filters[key]))
      throw new FinancialError('Report filter is unavailable in this household scope', 403)
  }
  const scopedAccounts = accounts.filter(
    (a) =>
      (!filters?.accountId || a.id === filters.accountId) &&
      (!filters?.groupId ||
        groups.find((g) => g.id === filters.groupId)!.members.some((m) => m.accountId === a.id)),
  )
  const scopedIds = new Set(scopedAccounts.map((a) => a.id)),
    scopedDebts = debts.filter((d) => !filters?.debtId || d.id === filters.debtId),
    selectedDebtIds = new Set(scopedDebts.map((d) => d.id))
  const bills = source.bills
    .filter(
      (b) => associated(b.memberIds) && (!filters?.debtId || b.linkedDebtId === filters.debtId),
    )
    .map((b) => ({
      ...b,
      payments: b.payments.filter(
        (p) => !p.debtPaymentId || selectedDebtIds.has(p.debtId ?? b.linkedDebtId ?? ''),
      ),
    }))
  const assets = source.assets
      .filter(
        (a) => associated(a.memberIds) && (!filters?.debtId || a.debtIds.includes(filters.debtId)),
      )
      .map((a) => ({ ...a, debtIds: a.debtIds.filter((id) => debtIds.has(id)) })),
    assetIds = new Set(assets.map((a) => a.id))
  return {
    ctx,
    owner,
    member,
    options,
    protectedAssetIds: new Set(
      source.assets
        .filter(
          (a) => assets.some((r) => r.id === a.id) && a.debtIds.some((id) => !debtIds.has(id)),
        )
        .map((a) => a.id),
    ),
    source: {
      ...source,
      refunds: source.refunds.filter(
        (r) =>
          associated(r.memberIds) &&
          (!r.debtPaymentId ||
            source.payments.some((p) => p.id === r.debtPaymentId && selectedDebtIds.has(p.debtId))),
      ),
      banking: source.banking
        ? {
            summary: {
              ...source.banking.summary,
              accounts: source.banking.summary.accounts.filter((a) => associated(a.memberIds)),
            },
            transactions: source.banking.transactions.filter((t) =>
              source.banking!.summary.accounts.some(
                (a) => a.id === t.accountId && associated(a.memberIds),
              ),
            ),
          }
        : null,
      debts: scopedDebts,
      bills,
      assets,
      valuations: source.valuations.filter((v) => assetIds.has(v.assetId)),
      balances: source.balances.filter((b) => selectedDebtIds.has(b.debtId)),
      payments: source.payments.filter((p) => selectedDebtIds.has(p.debtId)),
      expenses: source.expenses.filter((e) => associated([e.responsibleMemberId])),
      income: {
        ...source.income,
        sources: source.income.sources.filter((s) => associated([s.responsibleMemberId])),
        transactions: source.income.transactions.filter((t) => associated([t.responsibleMemberId])),
      },
      accounts: scopedAccounts,
      results: source.results.filter(
        (r) =>
          scopedIds.has(r.accountId) &&
          (!filters?.groupId ||
            source.events.some((e) => e.id === r.copyEventId && e.groupId === filters.groupId)),
      ),
      payouts: source.payouts.filter((p) => scopedIds.has(p.accountId)),
      groups,
      goals: source.goals.filter(
        (g) =>
          (member
            ? g.responsibleMemberId === member ||
              (!!g.tradingAccountId && scopedIds.has(g.tradingAccountId))
            : true) &&
          (!filters?.accountId || g.tradingAccountId === filters.accountId) &&
          (!filters?.groupId || g.copyGroupId === filters.groupId),
      ),
      budgets: source.budgets.filter((b) => b.responsibleMemberId === member),
      offers: source.offers.filter((o) => selectedDebtIds.has(o.debtId)),
      offerHistory: source.offerHistory.filter((a) =>
        source.offers.some((o) => o.id === a.offerId && selectedDebtIds.has(o.debtId)),
      ),
      scenarios: owner && !member && !filters?.debtId ? source.scenarios : [],
      forecasts: owner && !member ? source.forecasts : [],
      snapshots: source.snapshots.filter(
        (s) =>
          s.report.memberId === member &&
          (owner ||
            (s.report.memberId === self &&
              s.report.assets.every((a) => assetIds.has(a.id)) &&
              s.report.liabilities.every((d) => selectedDebtIds.has(d.id)))),
      ),
    },
  }
}
