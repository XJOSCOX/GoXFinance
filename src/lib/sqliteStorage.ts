import { invoke } from '@tauri-apps/api/core'
import Database from '@tauri-apps/plugin-sql'
import { backupSchema, emptyBackup, LOCAL_HOUSEHOLD_ID, parseBackup, schemas, settingsSchema, householdSchema, newBase, type Backup, type Collection, type Household, type Settings } from './schema'

const URL = 'sqlite:goxplan.sqlite'
const tables: Record<Collection, string> = {
  members: 'household_members', incomes: 'income_sources', expenses: 'expenses', debts: 'debts',
  payments: 'debt_payments', settlements: 'settlement_offers', savings: 'savings_goals', trading: 'trading_accounts',
  oneTimeExpenses: 'expense_transactions', tradingPayouts: 'trading_transactions', bankAccounts: 'bank_accounts',
  incomeTransactions: 'income_transactions', incomeRevisions: 'income_transaction_revisions', expenseTransactions: 'expense_transactions', bankTransfers: 'bank_transfers',
  categories: 'categories', monthlyBudgets: 'monthly_budgets', tradingTransactions: 'trading_transactions',
  savedScenarios: 'saved_scenarios', balanceCorrections: 'balance_corrections',
}
const moneyFields = new Set(['amount', 'hourlyRate', 'hourlyRateSnapshot', 'gross', 'deductions', 'originalBalance', 'balance', 'minimumPayment', 'settlementOffer', 'fees', 'offerAmount', 'agreedAmount', 'paidAmount', 'downPayment', 'target', 'saved', 'monthlyContribution', 'fundedBalance', 'realizedProfit', 'actualPayout', 'taxReserve', 'drawdown', 'projectedPayout', 'initialBalance', 'confirmedBalance', 'verifiedBalance', 'planned', 'actual', 'startingCash', 'monthlyEmergencySavings', 'monthlyExtraDebtPayment', 'hypotheticalTradingMonthly', 'previousAmount', 'nextAmount'])
const booleanFields = new Set(['active', 'cashOutflow', 'courtOrdered', 'transportationRisk', 'activeAtRisk', 'chargeOff', 'writtenAgreement', 'linkVerified'])
const jsonFields = new Set(['history'])
const snake = (key: string) => key.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)
const column = (key: string) => key === 'history' ? 'history_json' : moneyFields.has(key) ? `${snake(key)}_cents` : snake(key)
const toValue = (key: string, value: unknown): string | number | null => {
  if (value === undefined || value === null) return null
  if (moneyFields.has(key)) {
    const number = Number(value), cents = Math.round(number * 100)
    if (!Number.isFinite(number) || !Number.isSafeInteger(cents) || Math.abs(number * 100 - cents) > 0.000001) throw new Error(`${key} must be a cent-precision amount`)
    return cents
  }
  return booleanFields.has(key) ? (value ? 1 : 0) : jsonFields.has(key) ? JSON.stringify(value) : value as string | number
}
const fromValue = (key: string, value: unknown) => value === undefined || value === null ? null : moneyFields.has(key) ? Number(value) / 100 : booleanFields.has(key) ? Boolean(value) : jsonFields.has(key) ? JSON.parse(String(value)) : value
const auditSnapshot = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(value).map(([field, cell]) => [field, toValue(field, cell)])))
const fieldNames = (key: Collection) => Object.keys(schemas[key].shape)
type Statement = { sql: string; params: (string | number | null)[] }
let connection: Promise<Database> | undefined
const db = () => connection ??= Database.load(URL)
const apply = (statements: Statement[]) => invoke<void>('apply_finance_batch', { statements })
const physicalTable = (key: Collection, record?: Record<string, unknown>) => key === 'payments' && record?.settlementId ? 'settlement_payments' : tables[key]

function recordFromRow(key: Collection, row: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const field of fieldNames(key)) result[field] = fromValue(field, row[column(field)])
  return schemas[key].parse(result)
}
async function select(key: Collection): Promise<Backup[Collection]> {
  const sources = key === 'payments' ? ['debt_payments', 'settlement_payments'] : [tables[key]]
  const rows = (await Promise.all(sources.map(async table => {
    const filter = key === 'oneTimeExpenses' ? " AND kind = 'one_time'" :
      key === 'expenseTransactions' ? " AND kind <> 'one_time'" :
      key === 'tradingPayouts' ? " AND kind = 'payout'" :
      key === 'tradingTransactions' ? " AND kind <> 'payout'" : ''
    return (await db()).select<Record<string, unknown>[]>(`SELECT * FROM ${table} WHERE household_id = $1${filter}`, [LOCAL_HOUSEHOLD_ID])
  }))).flat()
  return rows.map(row => recordFromRow(key, row)) as Backup[Collection]
}
export async function readAll(): Promise<Backup> {
  const keys = Object.keys(tables) as Collection[]
  const [values, settingsRows, households] = await Promise.all([
    Promise.all(keys.map(select)),
    (await db()).select<Record<string, unknown>[]>('SELECT * FROM application_settings WHERE id = $1', ['main']),
    (await db()).select<Record<string, unknown>[]>('SELECT * FROM households WHERE id = $1', [LOCAL_HOUSEHOLD_ID]),
  ])
  const row = settingsRows[0]
  const settings = row ? settingsSchema.parse({ theme: row.theme, monthlyEssentialsBuffer: fromValue('amount', row.monthly_essentials_buffer_cents), homeCreditMilestone: row.home_credit_milestone, startingCash: fromValue('amount', row.starting_cash_cents), monthlyEmergencySavings: fromValue('amount', row.monthly_emergency_savings_cents), monthlyExtraDebtPayment: fromValue('amount', row.monthly_extra_debt_payment_cents) }) : emptyBackup().settings
  const household = households[0] ? householdSchema.parse({ id: households[0].id, name: households[0].name, createdAt: households[0].created_at, updatedAt: households[0].updated_at }) : emptyBackup().household
  return backupSchema.parse({ ...emptyBackup(), ...Object.fromEntries(keys.map((key, index) => [key, values[index]])), settings, household })
}
function insertStatement(key: Collection, record: Backup[Collection][number], mode: 'skip' | 'update' = 'update'): Statement {
  const parsed = schemas[key].parse(record) as Record<string, unknown>
  if (key === 'bankTransfers' && parsed.fromAccountId === parsed.toAccountId) throw new Error('Transfer accounts must differ')
  const table = physicalTable(key, parsed)
  const fields = fieldNames(key).filter(field => !(key === 'payments' && field === 'settlementId' && table === 'debt_payments'))
  const columns = ['household_id', ...fields.map(column)]
  const params = [LOCAL_HOUSEHOLD_ID, ...fields.map(field => toValue(field, parsed[field]))]
  if (key === 'oneTimeExpenses') { columns.push('kind', 'cash_outflow'); params.push('one_time', 0) }
  if (key === 'tradingPayouts') { columns.push('kind'); params.push('payout') }
  const placeholders = columns.map((_, index) => `?${index + 1}`).join(', ')
  const update = columns.filter(c => c !== 'id' && c !== 'household_id').map(c => `${c}=excluded.${c}`).join(', ')
  return { sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO ${mode === 'skip' ? 'NOTHING' : `UPDATE SET ${update}`}`, params }
}
const transactionCollections = new Set<Collection>(['payments', 'incomeTransactions', 'expenseTransactions', 'bankTransfers', 'tradingPayouts'])
function isExactDuplicate(key: Collection, incoming: Record<string, unknown>, existing: Record<string, unknown>) {
  if (incoming.id === existing.id) return false
  const fields = key === 'bankTransfers' ? ['date', 'amount', 'fromAccountId', 'toAccountId'] :
    key === 'tradingPayouts' ? ['date', 'amount', 'tradingId', 'bankAccountId'] :
    key === 'incomeTransactions' ? ['date', 'amount', 'sourceId', 'bankAccountId'] :
    key === 'expenseTransactions' ? ['date', 'amount', 'expenseId', 'bankAccountId', 'categoryId'] :
    ['date', 'amount', 'debtId', 'settlementId', 'expenseId', 'bankAccountId']
  return fields.every(field => (incoming[field] ?? null) === (existing[field] ?? null))
}
export async function saveRecord(key: Collection, record: Backup[Collection][number]) {
  if (key === 'balanceCorrections' || key === 'incomeRevisions') throw new Error('Audit history cannot be edited directly')
  const parsed = schemas[key].parse(record) as Record<string, unknown>
  if (key === 'bankTransfers' && parsed.fromAccountId === parsed.toAccountId) throw new Error('Transfer accounts must differ')
  if (key === 'incomeTransactions' && parsed.workPeriodStart && parsed.workPeriodEnd && String(parsed.workPeriodStart) > String(parsed.workPeriodEnd)) throw new Error('Work period end must be on or after start')
  const existing = await readAll()
  if (key === 'bankAccounts' && parsed.confirmedBalance !== null && !parsed.confirmedAt) throw new Error('A confirmed bank balance needs its statement date')
  if (key === 'debts' && parsed.verifiedBalance !== null && !parsed.verifiedAt) throw new Error('A creditor-confirmed balance needs its statement date')
  if (key === 'incomeTransactions') {
    const source = existing.incomes.find(row => row.id === parsed.sourceId)
    const isNew = !existing.incomeTransactions.some(row => row.id === parsed.id)
    if (isNew && source && source.payType !== 'salaried' && (!parsed.workPeriodStart || !parsed.workPeriodEnd || !parsed.confirmationDate || parsed.regularHours === null || parsed.overtimeHours === null)) throw new Error('Hourly and variable paychecks need work period, hours, and confirmation date')
  }
  if (transactionCollections.has(key) && (existing[key] as unknown as Record<string, unknown>[]).some(row => isExactDuplicate(key, parsed, row))) throw new Error('An identical transaction is already recorded. Edit it instead of adding a duplicate.')
  if (key === 'incomeTransactions' && parsed.sourceId && parsed.workPeriodStart && parsed.workPeriodEnd && existing.incomeTransactions.some(row => row.id !== parsed.id && row.sourceId === parsed.sourceId && row.workPeriodStart === parsed.workPeriodStart && row.workPeriodEnd === parsed.workPeriodEnd)) throw new Error('This source and work period already has a confirmed paycheck')
  const statements = [insertStatement(key, record)]
  if (key === 'incomeTransactions') {
    const old = existing.incomeTransactions.find(row => row.id === parsed.id)
    if (old && JSON.stringify(old) !== JSON.stringify(parsed)) {
      const revision = schemas.incomeRevisions.parse({ ...newBase(`${parsed.name} correction`), incomeTransactionId: parsed.id, previousSnapshot: auditSnapshot(old as unknown as Record<string, unknown>), nextSnapshot: auditSnapshot(parsed), date: new Date().toISOString().slice(0, 10), reason: String(parsed.notes || 'Paycheck correction') })
      statements.push(insertStatement('incomeRevisions', revision))
    }
  }
  if (key === 'payments') statements.push({ sql: `DELETE FROM ${physicalTable(key, parsed) === 'debt_payments' ? 'settlement_payments' : 'debt_payments'} WHERE id=?1`, params: [String(parsed.id)] })
  if (key === 'debts' || key === 'bankAccounts') {
    const old = (existing[key] as unknown as Record<string, unknown>[]).find(row => row.id === parsed.id)
    const field = key === 'debts' ? 'verifiedBalance' : 'confirmedBalance'
    if (old && old[field] !== parsed[field]) {
      const correction = schemas.balanceCorrections.parse({ ...newBase(`${parsed.name} balance confirmation`), entityType: key === 'debts' ? 'debt' : 'bank', entityId: parsed.id, previousAmount: old[field], nextAmount: parsed[field], date: new Date().toISOString().slice(0, 10), reason: String(parsed.notes || 'Manual balance confirmation') })
      statements.push(insertStatement('balanceCorrections', correction))
    }
  }
  await apply(statements)
}
export async function deleteRecord(key: Collection, id: string) {
  if (key === 'balanceCorrections' || key === 'incomeRevisions') throw new Error('Audit history is permanent')
  if (key === 'incomeTransactions') throw new Error('Confirmed paychecks cannot be deleted; correct the entry with an audit trail')
  const statements: Statement[] = key === 'payments' ? [
    { sql: 'DELETE FROM settlement_payments WHERE id=?1', params: [id] },
    { sql: 'DELETE FROM debt_payments WHERE id=?1', params: [id] },
  ] : [{ sql: `DELETE FROM ${tables[key]} WHERE id=?1`, params: [id] }]
  await apply(statements)
}
function settingsStatement(value: Settings): Statement {
  const parsed = settingsSchema.parse(value)
  return { sql: 'INSERT INTO application_settings (id,household_id,theme,monthly_essentials_buffer_cents,home_credit_milestone,starting_cash_cents,monthly_emergency_savings_cents,monthly_extra_debt_payment_cents,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET theme=excluded.theme,monthly_essentials_buffer_cents=excluded.monthly_essentials_buffer_cents,home_credit_milestone=excluded.home_credit_milestone,starting_cash_cents=excluded.starting_cash_cents,monthly_emergency_savings_cents=excluded.monthly_emergency_savings_cents,monthly_extra_debt_payment_cents=excluded.monthly_extra_debt_payment_cents,updated_at=excluded.updated_at',
    params: ['main', LOCAL_HOUSEHOLD_ID, parsed.theme, toValue('amount', parsed.monthlyEssentialsBuffer), parsed.homeCreditMilestone, toValue('amount', parsed.startingCash), toValue('amount', parsed.monthlyEmergencySavings), toValue('amount', parsed.monthlyExtraDebtPayment), new Date().toISOString()] }
}
export async function saveSettings(value: Settings) { await apply([settingsStatement(value)]) }
export async function saveHousehold(value: Household) {
  const parsed = householdSchema.parse(value)
  if (parsed.id !== LOCAL_HOUSEHOLD_ID) throw new Error('Household ID cannot change')
  await apply([{ sql: 'UPDATE households SET name=?1,updated_at=?2 WHERE id=?3', params: [parsed.name, new Date().toISOString(), parsed.id] }])
}
export type ImportPolicy = 'skip' | 'update' | 'review'
const paycheckKey = (row: Backup['incomeTransactions'][number]) => row.sourceId && row.workPeriodStart && row.workPeriodEnd ? `${row.sourceId}|${row.workPeriodStart}|${row.workPeriodEnd}` : null
export async function previewBackup(value: unknown) {
  const imported = parseBackup(value), current = await readAll()
  const counts = Object.fromEntries((Object.keys(tables) as Collection[]).map(key => [key, imported[key].length])) as Record<Collection, number>
  const conflicts = (Object.keys(tables) as Collection[]).flatMap(key => {
    const old = new Map((current[key] as unknown as Record<string, unknown>[]).map(row => [row.id, row]))
    return (imported[key] as unknown as Record<string, unknown>[]).filter(row => old.has(row.id) && JSON.stringify(old.get(row.id)) !== JSON.stringify(row)).map(row => ({ collection: key, id: String(row.id), name: String(row.name) }))
  })
  const currentPeriods = new Map(current.incomeTransactions.map(row => [paycheckKey(row), row.id]))
  const importedPeriods = new Map<string, string>()
  for (const row of imported.incomeTransactions) {
    const period = paycheckKey(row)
    if (!period) continue
    if ((currentPeriods.has(period) && currentPeriods.get(period) !== row.id) || (importedPeriods.has(period) && importedPeriods.get(period) !== row.id)) conflicts.push({ collection: 'incomeTransactions', id: row.id, name: `${row.name} (same source and work period)` })
    importedPeriods.set(period, row.id)
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { total, counts, conflicts, settingsConflict: JSON.stringify(imported.settings) !== JSON.stringify(current.settings), householdConflict: imported.household.name !== current.household.name }
}
function validateLinks(imported: Backup, existing: Backup) {
  if (imported.household.id !== LOCAL_HOUSEHOLD_ID) throw new Error('Backup belongs to a different household')
  const ids = (key: Collection) => new Set([...existing[key], ...imported[key]].map(row => row.id))
  const valid = Object.fromEntries((Object.keys(tables) as Collection[]).map(key => [key, ids(key)])) as Record<Collection, Set<string>>
  for (const key of Object.keys(tables) as Collection[]) {
    const rows = imported[key] as { id: string }[]
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`Duplicate UUID in ${key} backup table`)
  }
  const requireLink = (id: string | null, key: Collection) => { if (id && !valid[key].has(id)) throw new Error(`Missing ${key} reference: ${id}`) }
  imported.incomes.forEach(row => requireLink(row.memberId, 'members'))
  imported.debts.forEach(row => { requireLink(row.ownerId, 'members'); requireLink(row.originalDebtId, 'debts') })
  imported.settlements.forEach(row => requireLink(row.debtId, 'debts'))
  imported.payments.forEach(row => { requireLink(row.debtId, 'debts'); requireLink(row.expenseId, 'expenses'); requireLink(row.settlementId, 'settlements'); requireLink(row.bankAccountId, 'bankAccounts') })
  imported.tradingPayouts.forEach(row => { requireLink(row.tradingId, 'trading'); requireLink(row.bankAccountId, 'bankAccounts') })
  imported.incomeTransactions.forEach(row => { requireLink(row.sourceId, 'incomes'); requireLink(row.bankAccountId, 'bankAccounts') })
  imported.incomeRevisions.forEach(row => requireLink(row.incomeTransactionId, 'incomeTransactions'))
  imported.expenseTransactions.forEach(row => { requireLink(row.expenseId, 'expenses'); requireLink(row.categoryId, 'categories'); requireLink(row.bankAccountId, 'bankAccounts') })
  imported.bankTransfers.forEach(row => { requireLink(row.fromAccountId, 'bankAccounts'); requireLink(row.toAccountId, 'bankAccounts'); if (row.fromAccountId === row.toAccountId) throw new Error('Transfer accounts must differ') })
  imported.monthlyBudgets.forEach(row => requireLink(row.categoryId, 'categories'))
  imported.tradingTransactions.forEach(row => { requireLink(row.tradingId, 'trading'); requireLink(row.bankAccountId, 'bankAccounts') })
  const map = new Map(imported.debts.map(row => [row.id, row])), visiting = new Set<string>(), done = new Set<string>(), ordered: Backup['debts'] = []
  const visit = (id: string) => { if (done.has(id)) return; if (visiting.has(id)) throw new Error('Cyclic linked debts'); visiting.add(id); const row = map.get(id); if (row?.originalDebtId && map.has(row.originalDebtId)) visit(row.originalDebtId); if (row) ordered.push(row); visiting.delete(id); done.add(id) }
  imported.debts.forEach(row => visit(row.id))
  return ordered
}
export async function mergeBackup(value: unknown, policy: ImportPolicy = 'skip') {
  const imported = parseBackup(value), current = await readAll(), preview = await previewBackup(imported)
  if (policy === 'review' && (preview.conflicts.length || preview.settingsConflict || preview.householdConflict)) throw new Error('Import contains conflicts; select Skip or Update after reviewing the preview')
  const debts = validateLinks(imported, current)
  if (policy === 'update' && preview.conflicts.some(row => row.name.includes('(same source and work period)'))) throw new Error('Paychecks with different UUIDs share a source and work period; resolve them before updating')
  for (const key of Object.keys(tables) as Collection[]) for (const record of imported[key]) for (const field of fieldNames(key)) if (moneyFields.has(field)) toValue(field, (record as Record<string, unknown>)[field])
  const order: Collection[] = ['members', 'categories', 'bankAccounts', 'incomes', 'expenses', 'trading', 'debts', 'settlements', 'savings', 'oneTimeExpenses', 'incomeTransactions', 'incomeRevisions', 'expenseTransactions', 'bankTransfers', 'tradingPayouts', 'tradingTransactions', 'monthlyBudgets', 'savedScenarios', 'payments', 'balanceCorrections']
  const acceptedPeriods = new Set(current.incomeTransactions.map(paycheckKey).filter((value): value is string => value !== null))
  const statements = order.flatMap(key => (key === 'debts' ? debts : imported[key]).filter(record => {
    if (key !== 'incomeTransactions' || policy !== 'skip') return true
    const period = paycheckKey(record as Backup['incomeTransactions'][number])
    if (period && acceptedPeriods.has(period)) return false
    if (period) acceptedPeriods.add(period)
    return true
  }).map(record => insertStatement(key, record, policy === 'update' ? 'update' : 'skip')))
  if (policy === 'update') {
    for (const row of imported.incomeTransactions) {
      const previous = current.incomeTransactions.find(old => old.id === row.id)
      if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
        statements.push(insertStatement('incomeRevisions', schemas.incomeRevisions.parse({ ...newBase(`${row.name} import correction`), incomeTransactionId: row.id, previousSnapshot: auditSnapshot(previous), nextSnapshot: auditSnapshot(row), date: new Date().toISOString().slice(0, 10), reason: 'Versioned backup update' })))
      }
    }
    for (const row of imported.debts) {
      const previous = current.debts.find(old => old.id === row.id)
      if (previous && previous.verifiedBalance !== row.verifiedBalance) statements.push(insertStatement('balanceCorrections', schemas.balanceCorrections.parse({ ...newBase(`${row.name} import confirmation`), entityType: 'debt', entityId: row.id, previousAmount: previous.verifiedBalance, nextAmount: row.verifiedBalance, date: new Date().toISOString().slice(0, 10), reason: 'Versioned backup update' })))
    }
    for (const row of imported.bankAccounts) {
      const previous = current.bankAccounts.find(old => old.id === row.id)
      if (previous && previous.confirmedBalance !== row.confirmedBalance) statements.push(insertStatement('balanceCorrections', schemas.balanceCorrections.parse({ ...newBase(`${row.name} import confirmation`), entityType: 'bank', entityId: row.id, previousAmount: previous.confirmedBalance, nextAmount: row.confirmedBalance, date: new Date().toISOString().slice(0, 10), reason: 'Versioned backup update' })))
    }
  }
  const settingsAlreadyStored = (await (await db()).select<{ id: string }[]>('SELECT id FROM application_settings WHERE id = $1', ['main'])).length > 0
  if (!settingsAlreadyStored || policy === 'update') statements.push(settingsStatement(imported.settings))
  if (policy === 'update' && preview.householdConflict) statements.push({ sql: 'UPDATE households SET name=?1,updated_at=?2 WHERE id=?3', params: [imported.household.name, new Date().toISOString(), LOCAL_HOUSEHOLD_ID] })
  await apply(statements)
  return { imported: preview.total, conflicts: preview.conflicts.length, policy, verified: true }
}
export const replaceAll = mergeBackup
