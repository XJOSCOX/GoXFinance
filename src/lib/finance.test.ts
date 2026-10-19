import { describe, expect, it } from 'vitest'
import { actualCashPaid, activeDebts, emergencyFund, forecast, monthly, payoff, priorities, summary } from './finance'
import { exampleData } from './example'
import { debtSchema, emptyBackup, newBase, settlementSchema, type Payment } from './schema'

describe('financial calculations', () => {
  it('converts weekly take-home by 52 / 12 and supports other frequencies', () => {
    expect(monthly(780, 'weekly')).toBe(3380)
    expect(monthly(100, 'biweekly')).toBe(216.67)
    expect(monthly(100, 'semimonthly')).toBe(200)
    expect(monthly(1200, 'annual')).toBe(100)
    expect(monthly(null, 'monthly')).toBeNull()
    expect(monthly(100, 'variable')).toBeNull()
  })
  it('keeps balances separate from minimums and excludes unknown values', () => {
    const data = exampleData(); const s = summary(data)
    expect(s.income).toBe(3380); expect(s.expenses).toBe(2240); expect(s.minimums).toBe(665); expect(s.remaining).toBe(475)
    expect(s.balance).toBe(0); expect(s.missing.some(x => x.includes('Santander'))).toBe(true)
  })
  it('does not double count collection duplicates or transfers', () => {
    const data = emptyBackup()
    const original = debtSchema.parse({ ...newBase('Card'), creditor: 'Card', ownerId: null, balance: 1000, apr: 12, minimumPayment: 50, status: 'late', dueDate: null, daysLate: 10, security: 'unsecured', settlementOffer: null, collectionAgency: '', originalDebtId: null, priority: 6, active: true, history: [] })
    data.debts.push(original, { ...original, ...newBase('Collector'), creditor: 'Collector', originalDebtId: original.id })
    expect(activeDebts(data.debts)).toHaveLength(1)
    expect(summary(data).balance).toBe(1000)
    const payment = (kind: Payment['kind'], amount: number): Payment => ({ ...newBase(kind), debtId: null, settlementId: null, expenseId: null, date: '2026-10-01', amount, kind, cashOutflow: true })
    expect(actualCashPaid([payment('expense', 100), payment('transfer', 400), payment('credit-card-payment', 100)])).toBe(100)
  })
  it('keeps settlements after essentials and minimums', () => {
    const data = exampleData(); data.settlements.push(settlementSchema.parse({ ...newBase('Offer'), debtId: data.debts[0].id, offerAmount: 300, agreedAmount: null, paidAmount: null, status: 'proposed', date: null }))
    const list = priorities(data)
    expect(list.at(-1)?.type).toBe('settlement')
    expect(list[0].name).toBe('Rent')
  })
  it('forecasts and plans emergency reserves from known obligations', () => {
    const data = exampleData()
    expect(forecast(data, 2).map(x => x.cumulative)).toEqual([475, 950])
    expect(emergencyFund(data)).toMatchObject({ monthlyEssential: 2905, target: 8715, gap: 8715 })
  })
  it('calculates payoff and detects payments that cannot amortize', () => {
    expect(payoff(1200, 0, 100)).toEqual({ months: 12, interest: 0 })
    expect(payoff(1200, 12, 10)).toBeNull()
    expect(payoff(0, 12, 10)).toEqual({ months: 0, interest: 0 })
  })
})
