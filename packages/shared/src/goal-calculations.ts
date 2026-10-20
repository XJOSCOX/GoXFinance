import type { GoalInput, GoalProgress, GoalContribution } from './goals'
import type { TradingResult, TradingAccount } from './trading'
import type { CopyEvent, CopyGroup } from './copy-trading'
import type { IncomeTransaction } from './income'
import type { BillView } from './bills'
import type { Expense } from './expenses'
import type { Debt } from './debts'
import type { DebtBalanceHistory } from './debt-payments'
import { cashOutflows, sumCents } from './outflows'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { tradingResultDate } from './trading-calculations'
const date = (s: string) => new Date(s + 'T00:00:00Z')
function anchor(start: string, period: GoalInput['period'], index: number) {
  const original = date(start)
  if (period === 'daily' || period === 'weekly')
    return new Date(original.getTime() + index * (period === 'daily' ? 1 : 7) * 86400000)
      .toISOString()
      .slice(0, 10)
  const multiplier = period === 'monthly' ? 1 : period === 'quarterly' ? 3 : 12
  const next = new Date(
    Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + index * multiplier, 1),
  )
  next.setUTCDate(
    Math.min(
      original.getUTCDate(),
      new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  )
  return next.toISOString().slice(0, 10)
}
export function goalEndDate(start: string, period: GoalInput['period']) {
  if (!Number.isFinite(date(start).getTime())) return ''
  return period === 'custom'
    ? start
    : new Date(date(anchor(start, period, 1)).getTime() - 86400000).toISOString().slice(0, 10)
}
export function goalWindows(goal: GoalInput, today: string) {
  if (goal.period === 'custom') return [{ startDate: goal.startDate, endDate: goal.endDate }]
  let index =
    goal.period === 'daily' || goal.period === 'weekly'
      ? Math.floor(
          (date(today).getTime() - date(goal.startDate).getTime()) /
            86400000 /
            (goal.period === 'daily' ? 1 : 7),
        )
      : Math.floor(
          ((date(today).getUTCFullYear() - date(goal.startDate).getUTCFullYear()) * 12 +
            date(today).getUTCMonth() -
            date(goal.startDate).getUTCMonth()) /
            (goal.period === 'monthly' ? 1 : goal.period === 'quarterly' ? 3 : 12),
        )
  index = Math.max(0, index)
  if (anchor(goal.startDate, goal.period, index) > today) index = Math.max(0, index - 1)
  return Array.from({ length: Math.min(12, index + 1) }, (_, i) => ({
    startDate: anchor(goal.startDate, goal.period, index - i),
    endDate: new Date(date(anchor(goal.startDate, goal.period, index - i + 1)).getTime() - 86400000)
      .toISOString()
      .slice(0, 10),
  }))
}
export type GoalSources = {
  accounts: TradingAccount[]
  results: TradingResult[]
  events: CopyEvent[]
  groups: CopyGroup[]
  income: IncomeTransaction[]
  bills: BillView[]
  expenses: Expense[]
  debts: Debt[]
  balances: DebtBalanceHistory[]
  contributions: GoalContribution[]
}
export function goalProgress(
  goal: GoalInput & { id: string },
  window: { startDate: string; endDate: string },
  sources: GoalSources,
  today: string,
): GoalProgress {
  const within = (d: string) => d >= window.startDate && d <= window.endDate && d <= today
  const member = goal.responsibleMemberId
  let actual: number | null = 0,
    incomplete = false,
    source = ''
  if (['trading_profit', 'trading_loss'].includes(goal.goalType)) {
    const eventIds = new Set(
      sources.events.filter((e) => e.groupId === goal.copyGroupId).map((e) => e.id),
    )
    const records = sources.results.filter(
      (r) =>
        within(tradingResultDate(r)) &&
        (!goal.tradingAccountId || r.accountId === goal.tradingAccountId) &&
        (!goal.copyGroupId || eventIds.has(r.copyEventId ?? '')) &&
        (!member ||
          sources.accounts.some((a) => a.id === r.accountId && a.responsibleMemberId === member)),
    )
    const net = sumCents(records.map((r) => r.netCents))
    actual = goal.goalType === 'trading_loss' ? Math.max(0, -net) : net
    source =
      goal.goalType === 'trading_loss'
        ? 'Recorded net loss magnitude; profits offset losses'
        : 'Recorded net realized P&L'
    if (
      goal.goalType === 'trading_profit' &&
      records.some((r) =>
        sources.accounts.some((a) => a.id === r.accountId && a.stage === 'combine'),
      )
    )
      source = 'Recorded simulated Combine P&L; not cash or confirmation of passing'
  } else if (goal.goalType === 'confirmed_income') {
    actual = sumCents(
      sources.income
        .filter(
          (r) =>
            r.status === 'confirmed' &&
            r.depositDate &&
            within(r.depositDate) &&
            (!member || r.responsibleMemberId === member),
        )
        .map((r) => r.actualNetCents ?? 0),
    )
    source = 'Confirmed net deposits'
  } else if (goal.goalType === 'spending_limit') {
    const bills = sources.bills.filter((b) => !member || b.memberIds.includes(member))
    actual = sumCents(
      cashOutflows(
        sources.expenses.filter((e) => !member || e.responsibleMemberId === member),
        bills.flatMap((b) => b.payments),
        [],
      )
        .filter((r) => within(r.date))
        .map((r) => r.spendingCents),
    )
    source = 'Recorded purchase spending; credit repayments excluded'
  } else if (goal.goalType === 'bill_completion') {
    const periods = sources.bills
      .filter((b) => b.status !== 'cancelled' && (!member || b.memberIds.includes(member)))
      .flatMap((b) => b.periods)
      .filter((p) => within(p.dueDate))
    incomplete = periods.some((p) => p.amountCents === null)
    actual = sumCents(
      periods
        .filter((p) => p.amountCents !== null)
        .map((p) => Math.min(p.amountCents!, p.paidCents)),
    )
    source =
      'Completed payments against confirmed bills due in this period (capped at billed amounts)'
  } else if (goal.goalType === 'debt_reduction') {
    const groups = debtObligationGroups(
      sources.debts.filter(
        (d) => !member || d.memberAssignments.some((m) => m.memberId === member),
      ),
    )
    const changes = groups.flatMap((group) => {
      const debt = representativeDebtBalance(group)
      if (debt.confidence !== 'confirmed') return []
      const rows = sources.balances
        .filter(
          (b) =>
            b.debtId === debt.id &&
            b.householdId === debt.householdId &&
            b.effectiveDate <= window.endDate &&
            b.effectiveDate <= today &&
            ['creditor_statement', 'reconciliation'].includes(b.source),
        )
        .sort(
          (a, b) =>
            a.effectiveDate.localeCompare(b.effectiveDate) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        )
      const first = rows.filter((r) => r.effectiveDate <= window.startDate).at(-1),
        last = rows.at(-1)
      return first &&
        last &&
        last.effectiveDate > first.effectiveDate &&
        last.effectiveDate >= window.startDate
        ? [first.balanceCents - last.balanceCents]
        : []
    })
    incomplete = changes.length < groups.length
    actual = changes.length ? sumCents(changes) : null
    source =
      'Verified statement/reconciliation balance changes; payments are not principal reduction'
  } else {
    actual = sumCents(
      sources.contributions
        .filter((c) => c.goalId === goal.id && within(c.date))
        .map((c) => c.amountCents),
    )
    source =
      goal.goalType === 'savings'
        ? 'Explicit manual savings contributions, not bank assets'
        : 'Explicit manual contributions / adjustments'
  }
  if (window.startDate > today) {
    actual = null
    incomplete = true
  }
  return {
    ...window,
    notStarted: window.startDate > today,
    actualCents: actual,
    incomplete,
    source,
    met:
      actual === null
        ? null
        : goal.direction === 'at_least'
          ? actual >= goal.targetCents
          : actual <= goal.targetCents,
    shortfallCents: actual === null ? null : Math.max(0, sumCents([goal.targetCents, -actual])),
    overageCents: actual === null ? null : Math.max(0, sumCents([actual, -goal.targetCents])),
  }
}
