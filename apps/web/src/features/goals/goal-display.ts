import type { Goal } from '@goxfinance/shared'

export const goalCategories = ['Trading', 'Income', 'Savings', 'Debt', 'Spending', 'Bills', 'Other']
export function goalCategory(goal: Goal) {
  return {
    trading_profit: 'Trading',
    trading_loss: 'Trading',
    confirmed_income: 'Income',
    savings: 'Savings',
    debt_reduction: 'Debt',
    spending_limit: 'Spending',
    bill_completion: 'Bills',
    manual: 'Other',
  }[goal.goalType]
}
export function sortGoals(goals: Goal[], order: string) {
  const progress = (g: Goal) =>
    g.progress.notStarted || g.progress.actualCents === null || g.progress.incomplete
      ? null
      : g.targetCents === 0
        ? g.progress.met
          ? 1
          : 0
        : g.direction === 'at_most'
          ? 1 - g.progress.actualCents / g.targetCents
          : g.progress.actualCents / g.targetCents
  const gap = (g: Goal) =>
    g.progress.notStarted || g.progress.incomplete
      ? null
      : g.direction === 'at_most'
        ? g.progress.overageCents
        : g.progress.shortfallCents
  const numeric = (a: number | null, b: number | null, descending = false) =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : descending ? b - a : a - b
  return [...goals].sort((a, b) => {
    const result =
      order === 'name'
        ? a.name.localeCompare(b.name)
        : order === 'category'
          ? goalCategory(a).localeCompare(goalCategory(b))
          : order === 'progress'
            ? numeric(progress(a), progress(b), true)
            : order === 'remaining'
              ? numeric(gap(a), gap(b))
              : a.progress.endDate.localeCompare(b.progress.endDate)
    return result || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}
