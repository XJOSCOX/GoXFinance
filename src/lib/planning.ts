import { activeDebts, monthly, sumKnown } from './finance'
import type { Backup, Debt, Settlement } from './schema'

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const monthKey = (date: string) => date.slice(0, 7)
export function addMonths(date: string, count: number) {
  const [year, month, day] = date.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + count, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low'
const rank: Record<PriorityLevel, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
export function debtPriority(debt: Debt) {
  let score = 0
  const reasons: string[] = []
  if (debt.courtOrdered) { score += 50; reasons.push('Court-ordered or legal consequence') }
  if (debt.security === 'secured') { score += 28; reasons.push('Secured asset at risk') }
  if (debt.transportationRisk) { score += 25; reasons.push('Transportation risk') }
  if (debt.activeAtRisk && debt.status === 'current') { score += 24; reasons.push('Current account at risk of delinquency') }
  if (debt.status === 'late') { score += 15; reasons.push('Past due') }
  if (debt.status === 'collection' || debt.chargeOff) { score -= 12; reasons.push(debt.chargeOff ? 'Charged off' : 'In collection') }
  if ((debt.apr ?? 0) >= 20) { score += 10; reasons.push('High APR') }
  if ((debt.fees ?? 0) > 0) { score += 5; reasons.push('Fees reported') }
  if ((debt.creditUtilization ?? 0) >= 75) { score += 8; reasons.push('High credit utilization') }
  if (debt.settlementOffer !== null && debt.balance !== null && debt.settlementOffer < debt.balance) { score += 4; reasons.push('Settlement opportunity') }
  score += (debt.userUrgency - 3) * 5
  if (debt.userUrgency >= 4) reasons.push('User-marked urgency')
  const automatic: PriorityLevel = score >= 45 ? 'Critical' : score >= 25 ? 'High' : score >= 8 ? 'Medium' : 'Low'
  const level = debt.priorityOverride ?? automatic
  return { debt, level, automatic, score, reason: [debt.priorityOverride ? `Manual override: ${debt.priorityOverride}` : '', debt.priorityExplanation, ...reasons].filter(Boolean).join('; ') || 'No elevated risk factors entered' }
}
export function debtQueue(data: Backup) { return activeDebts(data.debts).map(debtPriority).sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score || a.debt.creditor.localeCompare(b.debt.creditor)) }

export function settlementTotal(settlement: Settlement, debt?: Debt) {
  return settlement.agreedAmount ?? settlement.offerAmount ?? (settlement.offerPercent !== null && debt?.balance !== null && debt?.balance !== undefined ? cents(debt.balance * settlement.offerPercent / 100) : null)
}
export function settlementPaid(settlement: Settlement, data: Backup) {
  return cents((settlement.paidAmount ?? 0) + sumKnown(data.payments.filter(p => p.settlementId === settlement.id && p.cashOutflow && (p.kind === 'debt' || p.kind === 'credit-card-payment')).map(p => p.amount)))
}
export function settlementSchedule(settlement: Settlement, debt?: Debt) {
  const total = settlementTotal(settlement, debt)
  const first = settlement.firstDueDate ?? settlement.date
  if (total === null || first === null) return []
  if (settlement.planType === 'lump-sum') return [{ date: first, amount: total, label: 'Lump sum' }]
  const down = Math.min(total, settlement.downPayment ?? 0)
  const remaining = cents(total - down)
  const count = Math.max(1, settlement.installments)
  const regular = cents(remaining / count)
  const result: { date: string; amount: number; label: string }[] = []
  if (down > 0) result.push({ date: first, amount: down, label: 'Down payment' })
  for (let index = 0; index < count; index++) result.push({ date: addMonths(first, index + (down > 0 ? 1 : 0)), amount: index === count - 1 ? cents(remaining - regular * (count - 1)) : regular, label: `Installment ${index + 1}/${count}` })
  return result
}
export function settlementPlan(settlement: Settlement, data: Backup) {
  const debt = data.debts.find(d => d.id === settlement.debtId)
  const total = settlementTotal(settlement, debt)
  const paid = settlementPaid(settlement, data)
  const schedule = settlementSchedule(settlement, debt)
  let applied = paid
  const remainingSchedule = schedule.map(item => { const offset = Math.min(item.amount, applied); applied = cents(applied - offset); return { ...item, remaining: cents(item.amount - offset) } })
  return { debt, total, paid, remaining: total === null ? null : Math.max(0, cents(total - paid)), savings: total === null || debt?.balance === null || debt?.balance === undefined ? null : cents(debt.balance - total), monthlyRequirement: settlement.planType === 'installments' && total !== null ? cents((total - Math.min(total, settlement.downPayment ?? 0)) / Math.max(1, settlement.installments)) : null, completionDate: schedule.at(-1)?.date ?? null, schedule: remainingSchedule }
}

export type SimulationOptions = { startMonth: string; startingCash: number; monthlyEmergencySavings: number; monthlyExtraDebtPayment: number; hypotheticalTradingMonthly?: number }
export function simulateCashFlow(data: Backup, options: SimulationOptions) {
  const accepted = data.settlements.filter(s => s.status === 'accepted' && s.writtenAgreement)
  const replacedDebtIds = new Set(accepted.map(s => s.debtId))
  const monthlyIncome = sumKnown(data.incomes.filter(i => i.active).map(i => monthly(i.amount, i.frequency)))
  const monthlyBills = sumKnown(data.expenses.filter(e => e.active).map(e => monthly(e.amount, e.frequency)))
  const monthlyMinimums = sumKnown(activeDebts(data.debts).filter(d => !replacedDebtIds.has(d.id)).map(d => d.minimumPayment))
  const settlementItems = accepted.flatMap(s => settlementPlan(s, data).schedule.filter(item => item.remaining > 0).map(item => ({ settlementId: s.id, name: s.name, date: item.date, amount: item.remaining })))
  const monthStart = `${options.startMonth}-01`
  let cash = cents(options.startingCash)
  return Array.from({ length: 12 }, (_, index) => {
    const date = addMonths(monthStart, index), month = monthKey(date)
    const startingCash = cash
    const actualPayouts = cents(sumKnown(data.tradingPayouts.filter(p => monthKey(p.date) === month).map(p => p.amount)))
    const hypothetical = cents(options.hypotheticalTradingMonthly ?? 0)
    const income = cents(monthlyIncome + actualPayouts + hypothetical)
    const oneTime = cents(sumKnown(data.oneTimeExpenses.filter(e => monthKey(e.date) === month).map(e => e.amount)))
    const settlementDue = settlementItems.filter(item => monthKey(item.date) <= month && (index === 0 || monthKey(item.date) === month)).map(item => ({ ...item, date: monthKey(item.date) < month ? monthStart : item.date }))
    const settlements = cents(sumKnown(settlementDue.map(item => item.amount)))
    const savings = cents(options.monthlyEmergencySavings)
    const extra = cents(options.monthlyExtraDebtPayment)
    const expenses = cents(monthlyBills + monthlyMinimums + oneTime + settlements + savings + extra)
    const freeCashFlow = cents(income - expenses)
    cash = cents(cash + freeCashFlow)
    const availableSettlementBudget = Math.max(0, cents(startingCash + income - monthlyBills - monthlyMinimums - oneTime - savings - extra - settlements))
    return { month, startingCash, endingCash: cash, income, recurringBills: monthlyBills, minimums: monthlyMinimums, oneTime, settlements, emergencySavings: savings, extraDebtPayments: extra, expenses, freeCashFlow, actualPayouts, hypothetical, shortfall: cash < 0 ? Math.abs(cash) : 0, availableSettlementBudget, obligations: settlementDue }
  })
}
export function householdOverview(data: Backup) {
  const debts = activeDebts(data.debts)
  return { totalDebt: sumKnown(debts.map(d => d.balance)), monthlyDebtPayments: sumKnown(debts.map(d => d.minimumPayment)), collectionBalances: sumKnown(debts.filter(d => d.status === 'collection').map(d => d.balance)), chargeOffBalances: sumKnown(debts.filter(d => d.chargeOff).map(d => d.balance)), settlementOpportunities: data.settlements.filter(s => ['proposed', 'negotiating', 'accepted'].includes(s.status)).length, jointDebtCount: debts.filter(d => d.ownerType === 'joint').length }
}
