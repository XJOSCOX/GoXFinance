import { describe, expect, it } from 'vitest'
import { actualCashPaid, activeDebts, bankLedger, budgetProgress, debtBalanceView, emergencyFund, forecast, monthly, payoff, priorities, summary } from './finance'
import { exampleData } from './example'
import { bankAccountSchema, bankTransferSchema, categorySchema, debtSchema, emptyBackup, expenseTransactionSchema, incomeTransactionSchema, monthlyBudgetSchema, newBase, paymentSchema, settlementSchema, type Payment } from './schema'

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
    expect(s.income).toBe(0); expect(s.expenses).toBe(2240); expect(s.minimums).toBe(665); expect(s.remaining).toBe(-2905)
    expect(s.balance).toBe(0); expect(s.missing.some(x => x.includes('Santander'))).toBe(true)
  })
  it('does not double count collection duplicates or transfers', () => {
    const data = emptyBackup()
    const original = debtSchema.parse({ ...newBase('Card'), creditor: 'Card', ownerId: null, balance: 1000, apr: 12, minimumPayment: 50, status: 'late', dueDate: null, daysLate: 10, security: 'unsecured', settlementOffer: null, collectionAgency: '', originalDebtId: null, priority: 6, active: true, history: [] })
    data.debts.push(original, { ...original, ...newBase('Collector'), creditor: 'Collector', originalDebtId: original.id, linkVerified: true })
    expect(activeDebts(data.debts)).toHaveLength(1)
    expect(summary(data).balance).toBe(1000)
    const payment = (kind: Payment['kind'], amount: number): Payment => ({ ...newBase(kind), debtId: null, settlementId: null, expenseId: null, bankAccountId: null, date: '2026-10-01', amount, kind, cashOutflow: true })
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
    expect(forecast(data, 2).map(x => x.cumulative)).toEqual([-2905, -5810])
    expect(emergencyFund(data)).toMatchObject({ monthlyEssential: 2905, target: 8715, gap: 8715 })
  })
  it('calculates payoff and detects payments that cannot amortize', () => {
    expect(payoff(1200, 0, 100)).toEqual({ months: 12, interest: 0 })
    expect(payoff(1200, 12, 10)).toBeNull()
    expect(payoff(0, 12, 10)).toEqual({ months: 0, interest: 0 })
  })
  it('keeps closed and charged-off positive balances in household debt and reconciles later payments', () => {
    const data = emptyBackup()
    const debt = debtSchema.parse({ ...newBase('Closed debt'), creditor: 'Creditor', balance: 1000, verifiedBalance: 900, verifiedAt: '2026-10-01', minimumPayment: 0, apr: null, status: 'closed', dueDate: null, daysLate: null, security: 'unsecured', settlementOffer: null, active: false, chargeOff: true })
    data.debts.push(debt)
    data.payments.push(paymentSchema.parse({ ...newBase('Partial'), debtId: debt.id, amount: 100, date: '2026-10-10', kind: 'debt' }))
    expect(summary(data).balance).toBe(900)
    expect(debtBalanceView(debt, data)).toMatchObject({ statement: 900, projected: 800, paymentsSinceConfirmation: 100 })
  })
  it('reconciles account transfers once and derives budget actuals from paid transactions', () => {
    const data = emptyBackup()
    const checking = bankAccountSchema.parse({ ...newBase('Checking'), accountType: 'checking', confirmedBalance: 1000, confirmedAt: '2026-10-01' })
    const savings = bankAccountSchema.parse({ ...newBase('Savings'), accountType: 'savings', confirmedBalance: 100, confirmedAt: '2026-10-01' })
    data.bankAccounts.push(checking, savings)
    data.incomeTransactions.push(incomeTransactionSchema.parse({ ...newBase('Deposit'), bankAccountId: checking.id, amount: 400, date: '2026-10-10' }))
    const category = categorySchema.parse({ ...newBase('Groceries'), kind: 'expense' })
    data.categories.push(category)
    data.expenseTransactions.push(expenseTransactionSchema.parse({ ...newBase('Food'), bankAccountId: checking.id, categoryId: category.id, amount: 50, date: '2026-10-11' }))
    data.bankTransfers.push(bankTransferSchema.parse({ ...newBase('Move'), fromAccountId: checking.id, toAccountId: savings.id, amount: 100, date: '2026-10-12' }))
    const budget = monthlyBudgetSchema.parse({ ...newBase('Food budget'), categoryId: category.id, month: '2026-10', planned: 200 })
    expect(bankLedger(checking, data).projected).toBe(1250)
    expect(bankLedger(savings, data).projected).toBe(200)
    expect(budgetProgress(data, budget)).toMatchObject({ planned: 200, actual: 50, variance: 150, source: 'transactions' })
  })
  it('does not add transactions again to a legacy current bank balance', () => {
    const data = emptyBackup()
    const account = bankAccountSchema.parse({ ...newBase('Legacy checking'), accountType: 'checking', balance: 1200 })
    data.bankAccounts.push(account)
    data.incomeTransactions.push(incomeTransactionSchema.parse({ ...newBase('Old deposit'), bankAccountId: account.id, amount: 300, date: '2026-09-01' }))
    expect(bankLedger(account, data)).toMatchObject({ projected: 1200, unreconciledLegacy: true })
  })
})
