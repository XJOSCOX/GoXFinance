import type { Backup, BankAccount, Debt, Income, Payment } from './schema'

export const monthly = (amount: number | null, frequency: Income['frequency']): number | null => {
  if (amount === null) return null
  const factor = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, annual: 1 / 12, variable: 0 }[frequency]
  return frequency === 'variable' ? null : Math.round((amount * factor + Number.EPSILON) * 100) / 100
}
export const sumKnown = (values: (number | null)[]) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
export const statedDebtBalance = (debt: Debt) => debt.verifiedBalance ?? debt.balance
/** Status describes the account; a positive balance remains a liability even when closed or charged off. */
export function activeDebts(debts: Debt[]) {
  const relevant = debts.filter(d => (statedDebtBalance(d) ?? 0) > 0 || (d.active && d.status !== 'settled' && d.status !== 'closed'))
  const groups = new Map<string, Debt>()
  for (const debt of relevant) {
    const key = debt.linkVerified && debt.originalDebtId && debts.some(row => row.id === debt.originalDebtId) ? debt.originalDebtId : debt.id
    const current = groups.get(key)
    if (!current || (statedDebtBalance(debt) ?? -1) > (statedDebtBalance(current) ?? -1)) groups.set(key, debt)
  }
  return [...groups.values()]
}
export function debtBalanceView(debt: Debt, data: Backup) {
  const statement = statedDebtBalance(debt)
  if (statement === null || debt.verifiedAt === null || debt.verifiedBalance === null) return { statement, projected: statement, verified: false, paymentsSinceConfirmation: 0 }
  const paymentsSinceConfirmation = sumKnown(data.payments.filter(p => p.debtId === debt.id && p.date > debt.verifiedAt! && p.cashOutflow && (p.kind === 'debt' || p.kind === 'credit-card-payment')).map(p => p.amount))
  return { statement, projected: Math.max(0, Math.round((statement - paymentsSinceConfirmation) * 100) / 100), verified: true, paymentsSinceConfirmation }
}
/** Bank ledger is a projection from a confirmed or opening balance, never a replacement for that balance. */
export function bankLedger(account: BankAccount, data: Backup) {
  const baseline = account.confirmedBalance ?? account.initialBalance ?? account.balance
  const unreconciledLegacy = account.confirmedBalance === null && account.initialBalance === null && account.balance !== null
  const after = (date: string) => !unreconciledLegacy && (!account.confirmedAt || date > account.confirmedAt)
  const income = data.incomeTransactions.filter(t => t.bankAccountId === account.id && after(t.date) && !data.tradingPayouts.some(p => p.bankAccountId === account.id && p.date === t.date && p.amount === t.amount)).reduce((n, t) => n + t.amount, 0)
  const payouts = data.tradingPayouts.filter(t => t.bankAccountId === account.id && after(t.date)).reduce((n, t) => n + t.amount, 0)
  const expenses = data.expenseTransactions.filter(t => t.bankAccountId === account.id && t.cashOutflow && after(t.date)).reduce((n, t) => n + t.amount, 0)
  const payments = data.payments.filter(t => t.bankAccountId === account.id && t.cashOutflow && after(t.date) && t.kind !== 'transfer' && !data.expenseTransactions.some(e => e.bankAccountId === account.id && e.date === t.date && e.amount === t.amount && e.expenseId === t.expenseId && t.expenseId !== null)).reduce((n, t) => n + t.amount, 0)
  const transfersIn = data.bankTransfers.filter(t => t.toAccountId === account.id && after(t.date)).reduce((n, t) => n + t.amount, 0)
  const transfersOut = data.bankTransfers.filter(t => t.fromAccountId === account.id && after(t.date)).reduce((n, t) => n + t.amount, 0)
  const change = Math.round((income + payouts + transfersIn - expenses - payments - transfersOut) * 100) / 100
  return { baseline, change, projected: baseline === null ? null : Math.round((baseline + change) * 100) / 100, income, payouts, expenses, payments, transfersIn, transfersOut, unreconciledLegacy }
}
export function budgetProgress(data: Backup, budget: Backup['monthlyBudgets'][number]) {
  const category = data.categories.find(row => row.id === budget.categoryId)
  const actualTransactions = data.expenseTransactions.filter(row => row.date.startsWith(budget.month) && row.cashOutflow && row.kind === 'expense' && (budget.categoryId ? row.categoryId === budget.categoryId : category ? row.category === category.name : row.category === budget.name))
  const actual = actualTransactions.length ? sumKnown(actualTransactions.map(row => row.amount)) : budget.actual
  return { planned: budget.planned, actual, variance: actual === null ? null : Math.round((budget.planned - actual) * 100) / 100, source: actualTransactions.length ? 'transactions' as const : budget.actual !== null ? 'manual' as const : 'missing' as const }
}
export function summary(data: Backup) {
  const incomeRows = data.incomes.filter(x => x.active)
  const expenseRows = data.expenses.filter(x => x.active)
  const debts = activeDebts(data.debts)
  const income = sumKnown(incomeRows.filter(x => x.payType === 'salaried').map(x => monthly(x.amount, x.frequency)))
  const expenses = sumKnown(expenseRows.map(x => monthly(x.amount, x.frequency)))
  const minimums = sumKnown(debts.map(x => x.minimumPayment))
  const balance = sumKnown(debts.map(statedDebtBalance))
  const missing = [...incomeRows.filter(x => x.payType === 'salaried' && monthly(x.amount, x.frequency) === null).map(x => `${x.name}: income amount or frequency needs confirmation`), ...incomeRows.filter(x => x.payType !== 'salaried' && !data.incomeTransactions.some(t => t.sourceId === x.id)).map(x => `${x.name}: no paycheck confirmed yet`), ...expenseRows.filter(x => monthly(x.amount, x.frequency) === null).map(x => `${x.name}: expense amount or frequency needs confirmation`), ...debts.filter(x => statedDebtBalance(x) === null || x.minimumPayment === null).map(x => `${x.creditor}: balance or minimum payment is missing`), ...data.debts.filter(x => x.originalDebtId && !x.linkVerified).map(x => `${x.creditor}: linked collection relationship needs verification`)]
  return { income, expenses, minimums, remaining: income - expenses - minimums, balance, overdue: debts.filter(x => x.status === 'late' || x.status === 'collection' || (x.daysLate ?? 0) > 0).length, missing, hasIncome: incomeRows.length > 0 }
}
export const actualCashPaid = (payments: Payment[]) => sumKnown(payments.filter(p => p.cashOutflow && p.kind !== 'transfer' && p.kind !== 'credit-card-payment').map(p => p.amount))
export function priorities(data: Backup) {
  const protectedCategories = ['housing', 'utilities', 'food', 'transport', 'legal']
  const essentials = data.expenses.filter(e => e.active).map(e => ({ id: e.id, name: e.name, amount: monthly(e.amount, e.frequency), priority: e.priority, tier: protectedCategories.includes(e.category) ? 0 : 2, reason: `${e.category} expense`, type: 'expense' as const }))
  const minimums = activeDebts(data.debts).map(d => ({ id: d.id, name: `${d.creditor} minimum`, amount: d.minimumPayment, priority: d.priority, tier: 1, reason: 'Current debt minimum', type: 'debt' as const }))
  const settlements = data.settlements.filter(s => s.status === 'proposed' || s.status === 'accepted').map(s => ({ id: s.id, name: s.name, amount: s.agreedAmount ?? s.offerAmount, priority: 9, tier: 3, reason: 'Optional settlement; fund essentials and minimums first', type: 'settlement' as const }))
  return [...essentials, ...minimums, ...settlements].sort((a, b) => a.tier - b.tier || a.priority - b.priority || a.name.localeCompare(b.name))
}
export function forecast(data: Backup, months = 6) {
  const s = summary(data)
  return Array.from({ length: months }, (_, i) => ({ month: i + 1, inflow: s.income, outflow: s.expenses + s.minimums, net: s.remaining, cumulative: s.remaining * (i + 1) }))
}
export function payoff(balance: number, apr: number, payment: number) {
  if (balance <= 0) return { months: 0, interest: 0 }
  if (payment <= 0) return null
  let remaining = balance, interest = 0
  for (let months = 1; months <= 600; months++) {
    const charge = remaining * apr / 100 / 12
    if (payment <= charge) return null
    interest += charge
    remaining = Math.max(0, remaining + charge - payment)
    if (remaining <= 0.005) return { months, interest }
  }
  return null
}
export function emergencyFund(data: Backup, targetMonths = 3) {
  const s = summary(data)
  const essential = data.expenses.filter(e => e.active && ['housing', 'utilities', 'food', 'transport', 'legal'].includes(e.category)).reduce((n, e) => n + (monthly(e.amount, e.frequency) ?? 0), 0) + s.minimums
  const saved = sumKnown(data.savings.filter(x => x.kind === 'emergency').map(x => x.saved))
  return { monthlyEssential: essential, target: essential * targetMonths, saved, gap: Math.max(0, essential * targetMonths - saved) }
}
export function calendarItems(data: Backup, month: string) {
  const items = [
    ...data.expenses.filter(e => e.active && e.dueDay).map(e => ({ id: e.id, name: e.name, date: `${month}-${String(e.dueDay).padStart(2, '0')}`, amount: monthly(e.amount, e.frequency), type: 'Expense' })),
    ...activeDebts(data.debts).filter(d => d.dueDate).map(d => ({ id: d.id, name: d.creditor, date: d.dueDate!, amount: d.minimumPayment, type: 'Debt minimum' }))
  ]
  return items.filter(i => i.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
}
