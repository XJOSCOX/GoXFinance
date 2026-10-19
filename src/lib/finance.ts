import type { Backup, Debt, Income, Payment } from './schema'

export const monthly = (amount: number | null, frequency: Income['frequency']): number | null => {
  if (amount === null) return null
  const factor = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, annual: 1 / 12, variable: 0 }[frequency]
  return frequency === 'variable' ? null : Math.round((amount * factor + Number.EPSILON) * 100) / 100
}
export const sumKnown = (values: (number | null)[]) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
export const activeDebts = (debts: Debt[]) => debts.filter(d => d.active && d.status !== 'settled' && d.status !== 'closed' && !d.originalDebtId)
export function summary(data: Backup) {
  const incomeRows = data.incomes.filter(x => x.active)
  const expenseRows = data.expenses.filter(x => x.active)
  const debts = activeDebts(data.debts)
  const income = sumKnown(incomeRows.map(x => monthly(x.amount, x.frequency)))
  const expenses = sumKnown(expenseRows.map(x => monthly(x.amount, x.frequency)))
  const minimums = sumKnown(debts.map(x => x.minimumPayment))
  const balance = sumKnown(debts.map(x => x.balance))
  const missing = [...incomeRows.filter(x => monthly(x.amount, x.frequency) === null).map(x => `${x.name}: income amount or frequency needs confirmation`), ...expenseRows.filter(x => monthly(x.amount, x.frequency) === null).map(x => `${x.name}: expense amount or frequency needs confirmation`), ...debts.filter(x => x.balance === null || x.minimumPayment === null).map(x => `${x.creditor}: balance or minimum payment is missing`)]
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
