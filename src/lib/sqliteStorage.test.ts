import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { debtSchema, emptyBackup, expenseSchema, incomeSchema, memberSchema, newBase, oneTimeExpenseSchema, parseBackup, paymentSchema, savingsSchema, settlementSchema, tradingPayoutSchema, tradingSchema } from './schema'

const memory = new DatabaseSync(':memory:')
vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: async () => ({
  select: async (sql: string, values: unknown[] = []) => memory.prepare(sql.replace(/\$\d+/g, '?')).all(...values as (string | number | null)[]),
  execute: async (sql: string, values: unknown[] = []) => memory.prepare(sql.replace(/\$\d+/g, '?')).run(...values as (string | number | null)[])
}) } }))
import { mergeBackup, readAll, saveRecord } from './sqliteStorage'

beforeAll(() => { memory.exec('PRAGMA foreign_keys = ON'); memory.exec(readFileSync('src-tauri/migrations/0001_initial.sql', 'utf8')) })

describe('SQLite desktop persistence', () => {
  it('upgrades a version 1 backup without losing its UUIDs', () => {
    const older = { ...emptyBackup(), version: 1, oneTimeExpenses: undefined, tradingPayouts: undefined, members: [memberSchema.parse({ ...newBase('Legacy member') })] }
    const upgraded = parseBackup(older)
    expect(upgraded.version).toBe(2)
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
    expect(result).toMatchObject({ settingsImported: true, verified: true })
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
})
