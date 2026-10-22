import { commandModules } from '@goxfinance/shared'
export const quickLabels = {
  upload: 'Upload paycheck',
  estimate: 'Report hours / estimate',
  balance: 'Update available balance',
  bills: 'Review bills',
  debts: 'Review debt payment',
  planner: 'Smart Planner',
  insights: 'Financial Insights',
  budgets: 'Review budget',
}
export function quickDestination(home: string, action: (typeof commandModules)[number]) {
  const route =
    action === 'upload' || action === 'estimate'
      ? `income?action=${action}`
      : action === 'balance'
        ? 'planner?action=balance'
        : action
  return `/households/${home}/${route}`
}
