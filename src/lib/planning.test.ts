import { describe, expect, it } from 'vitest'
import { exampleData } from './example'
import { debtSchema, newBase, paymentSchema, settlementSchema, tradingPayoutSchema, oneTimeExpenseSchema } from './schema'
import { debtPriority, debtQueue, settlementPlan, simulateCashFlow } from './planning'

describe('priority and cash flow planning', () => {
  it('ranks legal and secured risk and respects a manual override', () => {
    const data = exampleData()
    const legal = debtSchema.parse({ ...data.debts[0], id: crypto.randomUUID(), name: 'Court', creditor: 'Court', balance: 100, minimumPayment: 10, courtOrdered: true })
    const collection = debtSchema.parse({ ...data.debts[0], id: crypto.randomUUID(), name: 'Collector', creditor: 'Collector', balance: 2000, minimumPayment: 0, status: 'collection' })
    data.debts = [collection, legal]
    expect(debtQueue(data)[0].debt.id).toBe(legal.id)
    expect(debtPriority(legal).level).toBe('Critical')
    expect(debtPriority({ ...collection, priorityOverride: 'High' }).reason).toContain('Manual override')
  })
  it('calculates an installment settlement and applies recorded payments', () => {
    const data = exampleData(); data.debts[0].balance = 1000
    const offer = settlementSchema.parse({ ...newBase('Offer'), debtId: data.debts[0].id, offerAmount: 600, agreedAmount: null, paidAmount: 50, status: 'accepted', date: null, planType: 'installments', downPayment: 100, installments: 2, firstDueDate: '2026-10-15', writtenAgreement: true })
    data.settlements.push(offer)
    data.payments.push(paymentSchema.parse({ ...newBase('First payment'), debtId: data.debts[0].id, settlementId: offer.id, expenseId: null, date: '2026-10-15', amount: 100, kind: 'debt', cashOutflow: true }))
    const plan = settlementPlan(offer, data)
    expect(plan).toMatchObject({ total: 600, savings: 400, paid: 150, remaining: 450, monthlyRequirement: 250, completionDate: '2026-12-15' })
    expect(plan.schedule.map(x => x.remaining)).toEqual([0, 200, 250])
  })
  it('keeps hypothetical trading outside baseline and includes actual dated payouts', () => {
    const data = exampleData()
    data.oneTimeExpenses.push(oneTimeExpenseSchema.parse({ ...newBase('Repair'), amount: 100, date: '2026-10-12', category: 'transport' }))
    data.tradingPayouts.push(tradingPayoutSchema.parse({ ...newBase('Withdrawal'), tradingId: data.trading[0].id, amount: 500, date: '2026-10-10' }))
    const options = { startMonth: '2026-10', startingCash: 100, monthlyEmergencySavings: 50, monthlyExtraDebtPayment: 25 }
    const baseline = simulateCashFlow(data, options)
    const scenario = simulateCashFlow(data, { ...options, hypotheticalTradingMonthly: 900 })
    expect(baseline).toHaveLength(12)
    expect(baseline[0].actualPayouts).toBe(500)
    expect(baseline[1].actualPayouts).toBe(0)
    expect(baseline[0].oneTime).toBe(100)
    expect(baseline[0].freeCashFlow).toBe(800)
    expect(scenario[0].endingCash - baseline[0].endingCash).toBe(900)
  })
})
