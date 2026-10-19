import { debtSchema, emptyBackup, newBase, type Backup } from './schema'
export function exampleData(): Backup {
  const data = emptyBackup()
  data.incomes.push({ ...newBase('Employment take-home'), memberId: null, amount: 780, frequency: 'weekly', kind: 'employment', hourlyRate: 25, active: true })
  data.expenses.push({ ...newBase('Rent'), amount: 1940, frequency: 'monthly', category: 'housing', dueDay: null, active: true, priority: 1 }, { ...newBase('Electricity'), amount: 300, frequency: 'monthly', category: 'utilities', dueDay: null, active: true, priority: 2 })
  data.debts.push(debtSchema.parse({ ...newBase('Santander'), creditor: 'Santander', ownerId: null, balance: null, apr: null, minimumPayment: 665, status: 'unverified', dueDate: null, daysLate: null, security: 'unknown', settlementOffer: null, collectionAgency: '', originalDebtId: null, priority: 6, active: true, history: [] }))
  for (let i = 1; i <= 3; i++) data.trading.push({ ...newBase(`Topstep account ${i}`), platform: 'Topstep', fundedBalance: null, realizedProfit: null, actualPayout: null, fees: null, taxReserve: null, drawdown: null, projectedPayout: null, confidence: 'unverified' })
  return data
}
