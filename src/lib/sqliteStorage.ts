import Database from '@tauri-apps/plugin-sql'
import { backupSchema, emptyBackup, parseBackup, schemas, settingsSchema, type Backup, type Collection, type Settings } from './schema'

const URL = 'sqlite:goxplan.sqlite'
const HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'
const tables: Record<Collection, string> = { members: 'household_members', incomes: 'income_sources', expenses: 'expenses', debts: 'debts', payments: 'debt_payments', settlements: 'settlement_offers', savings: 'savings_goals', trading: 'trading_accounts', oneTimeExpenses: 'expense_transactions', tradingPayouts: 'trading_transactions' }
const moneyFields = new Set(['amount', 'hourlyRate', 'originalBalance', 'balance', 'minimumPayment', 'settlementOffer', 'fees', 'offerAmount', 'agreedAmount', 'paidAmount', 'downPayment', 'target', 'saved', 'monthlyContribution', 'fundedBalance', 'realizedProfit', 'actualPayout', 'taxReserve', 'drawdown', 'projectedPayout'])
const booleanFields = new Set(['active', 'cashOutflow', 'courtOrdered', 'transportationRisk', 'activeAtRisk', 'chargeOff', 'writtenAgreement'])
const jsonFields = new Set(['history'])
const snake = (key: string) => key.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)
const column = (key: string) => key === 'history' ? 'history_json' : moneyFields.has(key) ? `${snake(key)}_cents` : snake(key)
const toValue = (key: string, value: unknown) => {
  if (value === undefined || value === null) return null
  if (moneyFields.has(key)) { const cents = Math.round(Number(value) * 100); if (!Number.isSafeInteger(cents) || Math.abs(Number(value) * 100 - cents) > 0.000001) throw new Error(`${key} must be a cent-precision amount`); return cents }
  return booleanFields.has(key) ? (value ? 1 : 0) : jsonFields.has(key) ? JSON.stringify(value) : value
}
const fromValue = (key: string, value: unknown) => value === undefined || value === null ? null : moneyFields.has(key) ? Number(value) / 100 : booleanFields.has(key) ? Boolean(value) : jsonFields.has(key) ? JSON.parse(String(value)) : value
const fieldNames = (key: Collection) => Object.keys(schemas[key].shape)
let connection: Promise<Database> | undefined
const db = () => connection ??= Database.load(URL)

function physicalTable(key: Collection, record?: Record<string, unknown>) {
  return key === 'payments' && record?.settlementId ? 'settlement_payments' : tables[key]
}
function recordFromRow(key: Collection, row: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const field of fieldNames(key)) result[field] = fromValue(field, row[column(field)])
  return schemas[key].parse(result)
}
async function select(key: Collection): Promise<Backup[Collection]> {
  const database = await db()
  const sources = key === 'payments' ? ['debt_payments', 'settlement_payments'] : [tables[key]]
  const rows = (await Promise.all(sources.map(table => database.select<Record<string, unknown>[]>(`SELECT * FROM ${table} WHERE household_id = $1`, [HOUSEHOLD_ID])))).flat()
  return rows.map(row => recordFromRow(key, row)) as Backup[Collection]
}
export async function readAll(): Promise<Backup> {
  const keys = Object.keys(tables) as Collection[]
  const values = await Promise.all(keys.map(select))
  const settingsRows = await (await db()).select<Record<string, unknown>[]>('SELECT * FROM application_settings WHERE id = $1', ['main'])
  const settings = settingsRows.length ? settingsSchema.parse({ theme: settingsRows[0].theme, monthlyEssentialsBuffer: fromValue('amount', settingsRows[0].monthly_essentials_buffer_cents), homeCreditMilestone: settingsRows[0].home_credit_milestone, startingCash: fromValue('amount', settingsRows[0].starting_cash_cents), monthlyEmergencySavings: fromValue('amount', settingsRows[0].monthly_emergency_savings_cents), monthlyExtraDebtPayment: fromValue('amount', settingsRows[0].monthly_extra_debt_payment_cents) }) : emptyBackup().settings
  const collections = Object.fromEntries(keys.map((key, index) => [key, values[index]]))
  return backupSchema.parse({ ...emptyBackup(), ...collections, settings })
}
export async function saveRecord(key: Collection, record: Backup[Collection][number], mode: 'upsert' | 'insert-only' = 'upsert') {
  const parsed = schemas[key].parse(record) as Record<string, unknown>
  const table = physicalTable(key, parsed)
  const fields = fieldNames(key).filter(field => !(key === 'payments' && field === 'settlementId' && table === 'debt_payments'))
  const columns = ['household_id', ...fields.map(column)]
  const values = [HOUSEHOLD_ID, ...fields.map(field => toValue(field, parsed[field]))]
  if (key === 'oneTimeExpenses') { columns.push('kind', 'cash_outflow'); values.push('one_time', 1) }
  if (key === 'tradingPayouts') { columns.push('kind'); values.push('payout') }
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const update = columns.filter(c => c !== 'id' && c !== 'household_id').map(c => `${c} = excluded.${c}`).join(', ')
  const conflict = mode === 'insert-only' ? 'DO NOTHING' : `DO UPDATE SET ${update}`
  await (await db()).execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) ${conflict}`, values)
  if (key === 'payments' && mode === 'upsert') await (await db()).execute(`DELETE FROM ${table === 'debt_payments' ? 'settlement_payments' : 'debt_payments'} WHERE id = $1`, [parsed.id])
}
export async function deleteRecord(key: Collection, id: string) {
  const database = await db()
  if (key === 'payments') { await database.execute('DELETE FROM settlement_payments WHERE id = $1', [id]); await database.execute('DELETE FROM debt_payments WHERE id = $1', [id]) }
  else await database.execute(`DELETE FROM ${tables[key]} WHERE id = $1`, [id])
}
export async function saveSettings(value: Settings) {
  const parsed = settingsSchema.parse(value)
  const cents = [parsed.monthlyEssentialsBuffer, parsed.startingCash, parsed.monthlyEmergencySavings, parsed.monthlyExtraDebtPayment].map(amount => toValue('amount', amount))
  await (await db()).execute('INSERT INTO application_settings (id, household_id, theme, monthly_essentials_buffer_cents, home_credit_milestone, starting_cash_cents, monthly_emergency_savings_cents, monthly_extra_debt_payment_cents, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET theme=excluded.theme, monthly_essentials_buffer_cents=excluded.monthly_essentials_buffer_cents, home_credit_milestone=excluded.home_credit_milestone, starting_cash_cents=excluded.starting_cash_cents, monthly_emergency_savings_cents=excluded.monthly_emergency_savings_cents, monthly_extra_debt_payment_cents=excluded.monthly_extra_debt_payment_cents, updated_at=excluded.updated_at', ['main', HOUSEHOLD_ID, parsed.theme, cents[0], parsed.homeCreditMilestone, cents[1], cents[2], cents[3], new Date().toISOString()])
}
export async function mergeBackup(value: unknown) {
  const imported = parseBackup(value)
  const existing = await readAll()
  const settingsAlreadyStored = (await (await db()).select<{ id: string }[]>('SELECT id FROM application_settings WHERE id = $1', ['main'])).length > 0
  const ids = (key: Collection) => new Set([...existing[key], ...imported[key]].map(item => item.id))
  const memberIds = ids('members'), debtIds = ids('debts'), expenseIds = ids('expenses'), settlementIds = ids('settlements'), tradingIds = ids('trading')
  const requireLink = (id: string | null, valid: Set<string>, label: string) => { if (id && !valid.has(id)) throw new Error(`Missing ${label} reference: ${id}`) }
  imported.incomes.forEach(row => requireLink(row.memberId, memberIds, 'member'))
  imported.debts.forEach(row => { requireLink(row.ownerId, memberIds, 'owner'); requireLink(row.originalDebtId, debtIds, 'original debt') })
  imported.settlements.forEach(row => requireLink(row.debtId, debtIds, 'debt'))
  imported.payments.forEach(row => { requireLink(row.debtId, debtIds, 'debt'); requireLink(row.expenseId, expenseIds, 'expense'); requireLink(row.settlementId, settlementIds, 'settlement') })
  imported.tradingPayouts.forEach(row => requireLink(row.tradingId, tradingIds, 'trading account'))
  for (const key of Object.keys(tables) as Collection[]) for (const record of imported[key]) for (const field of fieldNames(key)) if (moneyFields.has(field)) toValue(field, (record as Record<string, unknown>)[field])
  const order: Collection[] = ['members', 'incomes', 'expenses', 'trading', 'debts', 'settlements', 'savings', 'oneTimeExpenses', 'tradingPayouts', 'payments']
  const debtMap = new Map(imported.debts.map(row => [row.id, row]))
  const debtRows: typeof imported.debts = [], visiting = new Set<string>(), done = new Set<string>()
  const visit = (id: string) => { if (done.has(id)) return; if (visiting.has(id)) throw new Error('Cyclic original-debt references in backup'); visiting.add(id); const row = debtMap.get(id); if (row?.originalDebtId && debtMap.has(row.originalDebtId)) visit(row.originalDebtId); if (row) debtRows.push(row); visiting.delete(id); done.add(id) }
  imported.debts.forEach(row => visit(row.id))
  for (const key of order) for (const record of key === 'debts' ? debtRows : imported[key]) await saveRecord(key, record, 'insert-only')
  if (!settingsAlreadyStored) await saveSettings(imported.settings)
  const current = await readAll()
  for (const key of order) {
    const currentIds = new Set(current[key].map(item => item.id))
    for (const record of imported[key]) if (!currentIds.has(record.id)) throw new Error(`Import verification failed for ${key}: ${record.id}`)
  }
  if (!settingsAlreadyStored && JSON.stringify(current.settings) !== JSON.stringify(imported.settings)) throw new Error('Import verification failed for settings')
  return { imported: order.reduce((n, key) => n + imported[key].length, 0), settingsImported: !settingsAlreadyStored, verified: true }
}
export const replaceAll = mergeBackup
