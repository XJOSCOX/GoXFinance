import type { PublicUser, Budget, BankingData, BankInbox } from '@goxfinance/shared'
import type { DebtService } from '../debts/debt.service'
import type { BillService } from '../bills/bill.service'
import type { expenseService } from '../expenses/expense.service'
import type { IncomeService } from '../income/income.service'
import type { TradingService } from '../trading/trading.service'
import type { PayoutService } from '../trading/payout.service'
import type { CopyService } from '../trading/copy.service'
import type { GoalService } from '../goals/goal.service'
import type { AssetRepository } from '../assets/asset.repository'
import type { PlanningRepository } from '../debt-planning/planning.repository'
import type { ForecastRepository } from '../forecasts/forecast.repository'
import type { BudgetRepository } from '../budgets/budget.repository'
import type { overviewRepository } from '../overview/overview.repository'
export function reportSources(
  services: {
    debts: DebtService
    bills: BillService
    expenses: ReturnType<typeof expenseService>
    income: IncomeService
    trading: TradingService
    payouts: PayoutService
    copier: CopyService
    goals: GoalService
  },
  stores: {
    assets: AssetRepository
    planning: PlanningRepository
    forecasts: ForecastRepository
    budgets: BudgetRepository
    overview: ReturnType<typeof overviewRepository>
  },
  banking?: (
    user: PublicUser,
    home: string,
  ) => { summary: BankingData; transactions: BankInbox['transactions'] },
) {
  return (user: PublicUser, home: string) => ({
    banking: banking?.(user, home) ?? null,
    debts: services.debts.list(user, home).debts,
    bills: services.bills.list(user, home),
    ...services.expenses.list(user, home),
    refunds: stores.overview.refunds(home),
    income: services.income.list(user, home),
    accounts: services.trading.accounts(user, home),
    results: services.trading.results(user, home),
    payouts: services.payouts.list(user, home),
    ...services.copier.list(user, home),
    ...services.goals.list(user, home),
    assets: stores.assets.all(home).map((a) => ({ ...a, canManage: false })),
    valuations: stores.assets.values(home),
    snapshots: stores.assets.snapshots(home),
    balances: stores.overview.balances(home),
    payments: stores.overview.payments(home),
    budgets: stores.budgets
      .all(home)
      .map((b) => ({ ...b, status: b.status as Budget['status'], canManage: false })),
    offerHistory: stores.planning.offers(home).flatMap((o) =>
      stores.planning.history(home, o.id).map((a) => {
        const entry = JSON.parse(a.afterJson ?? '{}')
        const after = entry.record ?? entry
        return {
          offerId: o.id,
          action: a.action,
          createdAt: a.createdAt,
          status: typeof after.status === 'string' ? after.status : null,
          amountCents: Number.isSafeInteger(after.amountCents)
            ? (after.amountCents as number)
            : null,
        }
      }),
    ),
    offers: stores.planning.offers(home).map((o) => ({ ...o, canManage: false })),
    scenarios: stores.planning.scenarios(home),
    forecasts: stores.forecasts.all(home),
  })
}
export type ReportSources = ReturnType<ReturnType<typeof reportSources>>
