import { backupSchema, parseBackup, type Backup, type Collection } from './schema'
import { summary } from './finance'
import { debtQueue, householdOverview, settlementPlan, simulateCashFlow } from './planning'

export const collections: Collection[] = ['members', 'incomes', 'expenses', 'debts', 'payments', 'settlements', 'savings', 'trading', 'oneTimeExpenses', 'tradingPayouts']
export function toJson(data: Backup) { return JSON.stringify(backupSchema.parse({ ...data, exportedAt: new Date().toISOString() }), null, 2) }
export function fromJson(text: string) { return parseBackup(JSON.parse(text)) }
const flatten = (value: unknown) => value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' ? JSON.stringify(value) : value
export async function toXlsx(data: Backup) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GoXPlan'; workbook.created = new Date()
  const overview = workbook.addWorksheet('Summary')
  const s = summary(data)
  const household = householdOverview(data)
  overview.addRows([['GoXPlan household summary', 'Value'], ['Schema version', data.version], ['Exported at', data.exportedAt], ['Monthly income (known)', s.income], ['Monthly expenses (known)', s.expenses], ['Debt minimums (known)', s.minimums], ['Remaining (known data)', s.remaining], ['Household debt (known)', household.totalDebt], ['Collection balances', household.collectionBalances], ['Charge-off balances', household.chargeOffBalances], ['Settlement opportunities', household.settlementOpportunities], ['Missing fields', s.missing.join('; ') || 'None']])
  for (const key of collections) {
    const sheet = workbook.addWorksheet(key[0].toUpperCase() + key.slice(1))
    const rows = data[key] as unknown as Record<string, unknown>[]
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))]
    if (!headers.length) headers.push('id', 'name', 'confidence')
    sheet.addRow(headers)
    rows.forEach(row => sheet.addRow(headers.map(h => flatten(row[h]))))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } }
    sheet.columns = headers.map(h => ({ key: h, width: Math.min(38, Math.max(14, h.length + 4)) }))
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17345A' } }
  }
  const priority = workbook.addWorksheet('Debt priorities')
  priority.addRow(['Creditor', 'Owner', 'Priority', 'Score', 'Reason', 'Balance', 'Minimum', 'Confidence'])
  debtQueue(data).forEach(item => priority.addRow([item.debt.creditor, item.debt.ownerType, item.level, item.score, item.reason, item.debt.balance, item.debt.minimumPayment, item.debt.confidence]))
  const schedule = workbook.addWorksheet('Payment schedules')
  schedule.addRow(['Settlement', 'Debt', 'Status', 'Due date', 'Payment', 'Unpaid', 'Written agreement'])
  data.settlements.forEach(settlement => settlementPlan(settlement, data).schedule.forEach(item => schedule.addRow([settlement.name, data.debts.find(d => d.id === settlement.debtId)?.creditor ?? '', settlement.status, item.date, item.amount, item.remaining, settlement.writtenAgreement ? 'Yes' : 'No'])))
  const projection = workbook.addWorksheet('Monthly forecast')
  projection.addRow(['Month', 'Starting cash', 'Income', 'Bills', 'Debt minimums', 'One-time expenses', 'Settlements', 'Emergency savings', 'Extra debt', 'Total expenses', 'Free cash flow', 'Ending cash', 'Shortfall', 'Settlement budget'])
  simulateCashFlow(data, { startMonth: new Date().toISOString().slice(0, 7), startingCash: data.settings.startingCash, monthlyEmergencySavings: data.settings.monthlyEmergencySavings, monthlyExtraDebtPayment: data.settings.monthlyExtraDebtPayment }).forEach(row => projection.addRow([row.month, row.startingCash, row.income, row.recurringBills, row.minimums, row.oneTime, row.settlements, row.emergencySavings, row.extraDebtPayments, row.expenses, row.freeCashFlow, row.endingCash, row.shortfall, row.availableSettlementBudget]))
  for (const sheet of [priority, schedule, projection]) { sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17345A' } }; sheet.columns = Array.from({ length: sheet.getRow(1).cellCount }, () => ({ width: 22 })) }
  overview.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}
export function toCsv(data: Backup, key: Collection) {
  const rows = data[key] as unknown as Record<string, unknown>[]
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))]
  if (!headers.length) headers.push('id', 'name', 'confidence')
  const quote = (v: unknown) => `"${String(flatten(v)).replaceAll('"', '""')}"`
  return [headers.map(quote).join(','), ...rows.map(row => headers.map(h => quote(row[h])).join(','))].join('\r\n')
}
export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function encryptBackup(json: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)))
  return JSON.stringify({ format: 'goxplan-encrypted', version: 1, kdf: 'PBKDF2-SHA256', iterations: 310000, salt: Array.from(salt), iv: Array.from(iv), ciphertext: Array.from(ciphertext) })
}
export async function decryptBackup(text: string, password: string) {
  const box = JSON.parse(text)
  if (box.format !== 'goxplan-encrypted' || box.version !== 1) throw new Error('Unsupported encrypted backup')
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(box.salt), iterations: 310000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(box.iv) }, key, new Uint8Array(box.ciphertext)))
}
