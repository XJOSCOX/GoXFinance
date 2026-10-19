import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { invoke } from '@tauri-apps/api/core'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { bankAccountSchema, bankTransferSchema, categorySchema, debtSchema, emptyBackup, expenseSchema, expenseTransactionSchema, incomeSchema, incomeTransactionSchema, memberSchema, monthlyBudgetSchema, newBase, oneTimeExpenseSchema, parseBackup, paymentSchema, savedScenarioSchema, savingsSchema, settlementSchema, tradingPayoutSchema, tradingSchema, tradingTransactionSchema } from './schema'

const memory = new DatabaseSync(':memory:')
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => ({
  select: async (sql: string, values: unknown[] = []) => memory.prepare(sql.replace(/\$\d+/g, '?')).all(...values as (string | number | null)[]),
  execute: async (sql: string, values: unknown[] = []) => memory.prepare(sql.replace(/\$\d+/g, '?')).run(...values as (string | number | null)[])
}) } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: async (_command: string, input: { statements: { sql: string; params: (string | number | null)[] }[] }) => {
  memory.exec('BEGIN')
  try { for (const statement of input.statements) memory.prepare(statement.sql.replace(/\?\d+/g, '?')).run(...statement.params); memory.exec('COMMIT') }
  catch (error) { memory.exec('ROLLBACK'); throw error }
} }))
import { deleteRecord, mergeBackup, previewBackup, readAll, saveHousehold, saveRecord } from './sqliteStorage'

beforeAll(() => { memory.exec('PRAGMA foreign_keys = ON'); for (const version of ['0001_initial', '0002_reconciliation', '0003_variable_paychecks']) memory.exec(readFileSync(`src-tauri/migrations/${version}.sql`, 'utf8')) })

describe('SQLite desktop persistence', () => {
  it('upgrades a version 1 backup without losing its UUIDs', () => {
    const older = { ...emptyBackup(), version: 1, oneTimeExpenses: undefined, tradingPayouts: undefined, members: [memberSchema.parse({ ...newBase('Legacy member') })] }
    const upgraded = parseBackup(older)
    expect(upgraded.version).toBe(3)
    expect(upgraded.members[0].id).toBe(older.members[0].id)
  })
  it('retains rows after a database connection closes and reopens', () => {
    const folder = mkdtempSync(join(tmpdir(), 'goxplan-reopen-')), file = join(folder, 'test.sqlite')
    try {
      const first = new DatabaseSync(file)
      first.exec(readFileSync('src-tauri/migrations/0001_initial.sql', 'utf8'))
      first.prepare("INSERT INTO household_members (id,household_id,name,role,notes,confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), '00000000-0000-0000-0000-000000000001', 'Reopen test', 'Member', '', 'confirmed', new Date().toISOString(), new Date().toISOString())
      first.close()
      const second = new DatabaseSync(file)
      expect(second.prepare("SELECT count(*) AS n FROM household_members WHERE name='Reopen test'").get()).toMatchObject({ n: 1 })
      second.close()
    } finally { unlinkSync(file); rmdirSync(folder) }
  })
  it('applies additive migrations to an existing hourly source without changing old deposits', () => {
    const older = new DatabaseSync(':memory:')
    try {
      older.exec('PRAGMA foreign_keys=ON')
      older.exec(readFileSync('src-tauri/migrations/0001_initial.sql', 'utf8'))
      const sourceId = crypto.randomUUID(), depositId = crypto.randomUUID(), stamp = new Date().toISOString()
      older.prepare('INSERT INTO income_sources (id,household_id,member_id,name,amount_cents,frequency,kind,hourly_rate_cents,active,notes,confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(sourceId, '00000000-0000-0000-0000-000000000001', null, 'Older hourly source', 78000, 'weekly', 'employment', 2500, 1, '', 'confirmed', stamp, stamp)
      older.prepare('INSERT INTO income_transactions (id,household_id,source_id,bank_account_id,name,amount_cents,date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(depositId, '00000000-0000-0000-0000-000000000001', sourceId, null, 'Old deposit', 70000, '2026-09-01', '', stamp, stamp)
      older.exec(readFileSync('src-tauri/migrations/0002_reconciliation.sql', 'utf8'))
      older.exec(readFileSync('src-tauri/migrations/0003_variable_paychecks.sql', 'utf8'))
      expect(older.prepare('SELECT pay_type,hourly_rate_cents FROM income_sources WHERE id=?').get(sourceId)).toMatchObject({ pay_type: 'hourly', hourly_rate_cents: 2500 })
      expect(older.prepare('SELECT amount_cents,work_period_start FROM income_transactions WHERE id=?').get(depositId)).toMatchObject({ amount_cents: 70000, work_period_start: null })
    } finally { older.close() }
  })
  it('creates required normalized tables and enforces foreign keys', () => {
    const tables = memory.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
    for (const name of ['household_members', 'income_sources', 'income_transactions', 'expenses', 'expense_transactions', 'debts', 'debt_payments', 'settlement_offers', 'settlement_payments', 'bank_accounts', 'savings_goals', 'trading_accounts', 'trading_transactions', 'monthly_budgets', 'categories', 'application_settings']) expect(tables).toContain(name)
    const missing = incomeSchema.parse({ ...newBase('Invalid'), memberId: crypto.randomUUID(), amount: 100, frequency: 'monthly' })
    return expect(saveRecord('incomes', missing)).rejects.toThrow()
  })
  it('imports settings into a fresh database and verifies them', async () => {
    const backup = emptyBackup()
    backup.settings.startingCash = 123.45
    const result = await mergeBackup(backup)
    expect(result).toMatchObject({ verified: true })
    expect((await readAll()).settings.startingCash).toBe(123.45)
    expect(memory.prepare('SELECT starting_cash_cents FROM application_settings WHERE id = ?').get('main')).toMatchObject({ starting_cash_cents: 12345 })
  })
  it('round trips CRUD and stores money as integer cents', async () => {
    const member = memberSchema.parse({ ...newBase('Person') })
    await saveRecord('members', member)
    const income = incomeSchema.parse({ ...newBase('Pay'), memberId: member.id, amount: 780.25, frequency: 'weekly' })
    await saveRecord('incomes', income)
    const stored = memory.prepare('SELECT amount_cents, typeof(amount_cents) AS type FROM income_sources WHERE id = ?').get(income.id)
    expect(stored).toMatchObject({ amount_cents: 78025, type: 'integer' })
    expect((await readAll()).incomes.find(x => x.id === income.id)?.amount).toBe(780.25)
    const debt = debtSchema.parse({ ...newBase('Debt'), creditor: 'Creditor', ownerId: member.id, balance: 1040.55, apr: null, minimumPayment: 25, status: 'current', dueDate: null, daysLate: null, security: 'unsecured', settlementOffer: null })
    await saveRecord('debts', debt)
    const settlement = settlementSchema.parse({ ...newBase('Offer'), debtId: debt.id, offerAmount: 500, agreedAmount: null, paidAmount: null, status: 'proposed', date: null })
    await saveRecord('settlements', settlement)
    const payment = paymentSchema.parse({ ...newBase('Offer payment'), debtId: debt.id, settlementId: settlement.id, date: '2026-10-18', amount: 25.5, kind: 'debt' })
    await saveRecord('payments', payment)
    expect((await readAll()).settlements[0].debtId).toBe(debt.id)
    expect(memory.prepare('SELECT balance_cents FROM debts WHERE id = ?').get(debt.id)).toMatchObject({ balance_cents: 104055 })
    expect(memory.prepare('SELECT amount_cents FROM settlement_payments WHERE id = ?').get(payment.id)).toMatchObject({ amount_cents: 2550 })
    expect((await readAll()).payments.find(row => row.id === payment.id)?.settlementId).toBe(settlement.id)
    const expense = expenseSchema.parse({ ...newBase('Rent'), amount: 1940, frequency: 'monthly', category: 'housing' })
    await saveRecord('expenses', expense)
    const oneTime = oneTimeExpenseSchema.parse({ ...newBase('Repair'), amount: 42.15, date: '2026-10-18' })
    await saveRecord('oneTimeExpenses', oneTime)
    const savings = savingsSchema.parse({ ...newBase('Emergency'), target: 1000, saved: 25, monthlyContribution: 10, kind: 'emergency', targetDate: null })
    await saveRecord('savings', savings)
    const trading = tradingSchema.parse({ ...newBase('Trading'), platform: 'Example', fundedBalance: null, realizedProfit: null, actualPayout: null, fees: null, taxReserve: null, drawdown: null, projectedPayout: null })
    await saveRecord('trading', trading)
    const payout = tradingPayoutSchema.parse({ ...newBase('Withdrawal'), tradingId: trading.id, amount: 12.34, date: '2026-10-18' })
    await saveRecord('tradingPayouts', payout)
    const snapshot = await readAll()
    expect(snapshot.expenses.find(row => row.id === expense.id)?.amount).toBe(1940)
    expect(snapshot.oneTimeExpenses.find(row => row.id === oneTime.id)?.amount).toBe(42.15)
    expect(snapshot.savings.find(row => row.id === savings.id)?.saved).toBe(25)
    expect(snapshot.tradingPayouts.find(row => row.id === payout.id)?.amount).toBe(12.34)
  })
  it('merges backups by UUID without deleting existing records', async () => {
    const before = await readAll()
    const incoming = { ...before, members: [memberSchema.parse({ ...newBase('Imported') })], incomes: [], expenses: [], debts: [], payments: [], settlements: [], savings: [], trading: [], oneTimeExpenses: [], tradingPayouts: [] }
    const result = await mergeBackup(incoming)
    expect(result.verified).toBe(true)
    expect((await readAll()).members).toHaveLength(before.members.length + 1)
    await mergeBackup(incoming)
    expect((await readAll()).members).toHaveLength(before.members.length + 1)
  })
  it('confirms variable pay once per source and period, retaining historical rate and corrections', async () => {
    const source = incomeSchema.parse({ ...newBase('Hourly test'), amount: null, frequency: 'variable', payType: 'hourly', hourlyRate: 25 })
    await saveRecord('incomes', source)
    const paycheck = incomeTransactionSchema.parse({ ...newBase('Confirmed check'), sourceId: source.id, amount: 691.25, date: '2026-10-22', gross: 812.5, deductions: 121.25, regularHours: 30, overtimeHours: 1, overtimeMultiplier: 1.5, hourlyRateSnapshot: 25, workPeriodStart: '2026-10-12', workPeriodEnd: '2026-10-18', confirmationDate: '2026-10-22' })
    await saveRecord('incomeTransactions', paycheck)
    const duplicate = { ...paycheck, id: crypto.randomUUID(), amount: 690 }
    await expect(saveRecord('incomeTransactions', duplicate)).rejects.toThrow(/already has a confirmed paycheck/)
    await saveRecord('incomes', { ...source, hourlyRate: 27, updatedAt: new Date().toISOString() })
    expect((await readAll()).incomeTransactions.find(row => row.id === paycheck.id)?.hourlyRateSnapshot).toBe(25)
    await saveRecord('incomeTransactions', { ...paycheck, amount: 692, notes: 'Bank statement correction', updatedAt: new Date().toISOString() })
    const restored = await readAll()
    expect(restored.incomeTransactions.find(row => row.id === paycheck.id)?.amount).toBe(692)
    expect(restored.incomeRevisions.filter(row => row.incomeTransactionId === paycheck.id)).toHaveLength(1)
    expect(memory.prepare('SELECT gross_cents, hourly_rate_snapshot_cents FROM income_transactions WHERE id=?').get(paycheck.id)).toMatchObject({ gross_cents: 81250, hourly_rate_snapshot_cents: 2500 })
  })
  it('persists account, transfer, category, budget, trading, and household CRUD', async () => {
    const first = bankAccountSchema.parse({ ...newBase('Checking'), accountType: 'checking', initialBalance: 100 })
    const second = bankAccountSchema.parse({ ...newBase('Savings'), accountType: 'savings', initialBalance: 50 })
    await saveRecord('bankAccounts', first); await saveRecord('bankAccounts', second)
    const transfer = bankTransferSchema.parse({ ...newBase('Move'), fromAccountId: first.id, toAccountId: second.id, amount: 20, date: '2026-10-20' })
    await saveRecord('bankTransfers', transfer)
    const category = categorySchema.parse({ ...newBase('Groceries'), kind: 'expense' })
    await saveRecord('categories', category)
    const expense = expenseTransactionSchema.parse({ ...newBase('Food'), bankAccountId: first.id, categoryId: category.id, amount: 15.25, date: '2026-10-20' })
    await saveRecord('expenseTransactions', expense)
    const budget = monthlyBudgetSchema.parse({ ...newBase('Groceries'), categoryId: category.id, month: '2026-10', planned: 100 })
    await saveRecord('monthlyBudgets', budget)
    const trading = tradingSchema.parse({ ...newBase('Test account'), platform: 'Test', fundedBalance: null, realizedProfit: null, actualPayout: null, fees: null, taxReserve: null, drawdown: null, projectedPayout: null })
    await saveRecord('trading', trading)
    const activity = tradingTransactionSchema.parse({ ...newBase('Fee'), tradingId: trading.id, amount: 5, date: '2026-10-20', kind: 'fee' })
    await saveRecord('tradingTransactions', activity)
    const scenario = savedScenarioSchema.parse({ ...newBase('Conservative'), startMonth: '2026-10', startingCash: 30, monthlyEmergencySavings: 10, monthlyExtraDebtPayment: 0, hypotheticalTradingMonthly: 0 })
    await saveRecord('savedScenarios', scenario)
    const household = (await readAll()).household
    await saveHousehold({ ...household, name: 'Local test household' })
    const reopened = await readAll()
    expect(reopened.household.name).toBe('Local test household')
    expect(reopened.bankTransfers.find(row => row.id === transfer.id)?.amount).toBe(20)
    expect(reopened.monthlyBudgets.find(row => row.id === budget.id)?.planned).toBe(100)
    expect(reopened.savedScenarios.find(row => row.id === scenario.id)?.startingCash).toBe(30)
    expect(memory.prepare('SELECT amount_cents FROM expense_transactions WHERE id=?').get(expense.id)).toMatchObject({ amount_cents: 1525 })
    await deleteRecord('bankTransfers', transfer.id)
    expect((await readAll()).bankTransfers.some(row => row.id === transfer.id)).toBe(false)
  })
  it('rolls back a multi-row batch if a foreign key fails', async () => {
    const id = crypto.randomUUID(), timestamp = new Date().toISOString()
    await expect(invoke('apply_finance_batch', { statements: [
      { sql: 'INSERT INTO household_members (id,household_id,name,role,notes,confidence,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)', params: [id, '00000000-0000-0000-0000-000000000001', 'Rollback', 'Member', '', 'confirmed', timestamp, timestamp] },
      { sql: 'INSERT INTO income_sources (id,household_id,member_id,name,amount_cents,frequency,kind,hourly_rate_cents,active,notes,confidence,created_at,updated_at,pay_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)', params: [crypto.randomUUID(), '00000000-0000-0000-0000-000000000001', crypto.randomUUID(), 'Invalid', 100, 'monthly', 'employment', null, 1, '', 'confirmed', timestamp, timestamp, 'salaried'] }
    ] })).rejects.toThrow()
    expect(memory.prepare('SELECT id FROM household_members WHERE id=?').get(id)).toBeUndefined()
  })
  it('previews UUID conflicts and applies explicit skip or update policies', async () => {
    const member = memberSchema.parse({ ...newBase('Before') })
    await saveRecord('members', member)
    const backup = emptyBackup(); backup.members = [{ ...member, name: 'After' }]
    expect((await previewBackup(backup)).conflicts).toHaveLength(1)
    await mergeBackup(backup, 'skip')
    expect((await readAll()).members.find(row => row.id === member.id)?.name).toBe('Before')
    await mergeBackup(backup, 'update')
    expect((await readAll()).members.find(row => row.id === member.id)?.name).toBe('After')
  })
})
