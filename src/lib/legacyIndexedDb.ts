import Dexie, { type Table } from 'dexie'
import { emptyBackup, parseBackup, type Backup, type Collection, type Debt, type Expense, type Income, type Member, type OneTimeExpense, type Payment, type Savings, type Settlement, type Trading, type TradingPayout, type Settings } from './schema'

class GoXDatabase extends Dexie {
  members!: Table<Member, string>; incomes!: Table<Income, string>; expenses!: Table<Expense, string>; debts!: Table<Debt, string>; payments!: Table<Payment, string>; settlements!: Table<Settlement, string>; savings!: Table<Savings, string>; trading!: Table<Trading, string>; oneTimeExpenses!: Table<OneTimeExpense, string>; tradingPayouts!: Table<TradingPayout, string>; settings!: Table<{ id: string; value: Settings }, string>
  constructor() {
    super('GoXPlan')
    this.version(1).stores({ members: 'id,name', incomes: 'id,name', expenses: 'id,name', debts: 'id,creditor,originalDebtId', payments: 'id,date', settlements: 'id,debtId', savings: 'id,kind', trading: 'id,platform', settings: 'id' })
    this.version(2).stores({ members: 'id,name', incomes: 'id,name', expenses: 'id,name', debts: 'id,creditor,originalDebtId', payments: 'id,date,settlementId', settlements: 'id,debtId', savings: 'id,kind', trading: 'id,platform', oneTimeExpenses: 'id,date', tradingPayouts: 'id,date,tradingId', settings: 'id' }).upgrade(async tx => {
      await tx.table('settlements').toCollection().modify((row: Record<string, unknown>) => {
        if (row.status === 'paid') row.status = Number(row.paidAmount ?? 0) >= Number(row.agreedAmount ?? row.offerAmount ?? Infinity) ? 'completed' : 'accepted'
        if (row.status === 'rejected') row.status = 'expired'
      })
    })
  }
}
export const db = new GoXDatabase()
export async function readAll(): Promise<Backup> {
  const [members, incomes, expenses, debts, payments, settlements, savings, trading, oneTimeExpenses, tradingPayouts, settings] = await Promise.all([db.members.toArray(), db.incomes.toArray(), db.expenses.toArray(), db.debts.toArray(), db.payments.toArray(), db.settlements.toArray(), db.savings.toArray(), db.trading.toArray(), db.oneTimeExpenses.toArray(), db.tradingPayouts.toArray(), db.settings.get('main')])
  return parseBackup({ format: 'goxplan', version: 2, exportedAt: new Date().toISOString(), members, incomes, expenses, debts, payments, settlements, savings, trading, oneTimeExpenses, tradingPayouts, settings: settings?.value ?? emptyBackup().settings })
}
export async function mergeBackup(value: unknown) {
  const data = parseBackup(value)
  await db.transaction('rw', [db.members, db.incomes, db.expenses, db.debts, db.payments, db.settlements, db.savings, db.trading, db.oneTimeExpenses, db.tradingPayouts, db.settings], async () => {
    for (const key of ['members', 'incomes', 'expenses', 'debts', 'payments', 'settlements', 'savings', 'trading', 'oneTimeExpenses', 'tradingPayouts'] as Collection[]) await db.table(key).bulkPut(data[key])
    await db.settings.put({ id: 'main', value: data.settings })
  })
}
export const replaceAll = mergeBackup
export async function saveRecord(key: Collection, record: Backup[Collection][number]) { await db.table(key).put(record) }
export async function deleteRecord(key: Collection, id: string) { await db.table(key).delete(id) }
export async function saveSettings(value: Settings) { await db.settings.put({ id: 'main', value }) }
