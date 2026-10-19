import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { exampleData } from './example'
import { incomeTransactionSchema, newBase } from './schema'
import { collections, fromJson, toCsv, toJson, toXlsx } from './export'

describe('portable exports', () => {
  it('round trips a versioned complete JSON backup', () => {
    const original = exampleData(); const restored = fromJson(toJson(original))
    expect(restored.version).toBe(3)
    expect(restored.incomes).toEqual(original.incomes)
    expect(restored.debts).toEqual(original.debts)
    expect(restored.trading).toHaveLength(3)
    expect(() => fromJson('{"format":"goxplan","version":2}')).toThrow()
  })
  it('validates and upgrades a version 1 browser backup without losing IDs', () => {
    const source = exampleData()
    const old = { ...source, version: 1 }
    const restored = fromJson(JSON.stringify(old))
    expect(restored.version).toBe(3)
    expect(restored.debts[0].id).toBe(source.debts[0].id)
    expect(restored.debts[0].ownerType).toBe('mine')
    expect(restored.oneTimeExpenses).toEqual([])
  })
  it('exports every table to separate workbook sheets with confidence labels', async () => {
    const data = exampleData(); const binary = await toXlsx(data)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(binary)
    expect(workbook.worksheets.map(x => x.name)).toEqual(['Summary', ...collections.map(x => x[0].toUpperCase() + x.slice(1)), 'Debt priorities', 'Payment schedules', 'Monthly forecast'])
    const debts = workbook.getWorksheet('Debts')!
    expect(debts.getRow(1).values).toContain('confidence')
    expect(debts.getRow(2).values).toContain('Santander')
    expect(workbook.getWorksheet('Trading')?.rowCount).toBe(4)
  })
  it('quotes CSV values safely', () => {
    const data = exampleData(); data.incomes[0].notes = 'A "quoted", note'
    expect(toCsv(data, 'incomes')).toContain('"A ""quoted"", note"')
  })
  it('exports entered paycheck amounts and dates consistently in JSON and XLSX', async () => {
    const data = exampleData()
    const check = incomeTransactionSchema.parse({ ...newBase('October paycheck'), sourceId: data.incomes[0].id, amount: 691.25, gross: 812.5, deductions: 121.25, regularHours: 30, overtimeHours: 1, overtimeMultiplier: 1.5, hourlyRateSnapshot: 25, workPeriodStart: '2026-10-12', workPeriodEnd: '2026-10-18', confirmationDate: '2026-10-22', date: '2026-10-22' })
    data.incomeTransactions.push(check)
    const restored = fromJson(toJson(data))
    expect(restored.incomeTransactions[0]).toEqual(check)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await toXlsx(data))
    const sheet = workbook.getWorksheet('IncomeTransactions')!
    expect(sheet.getRow(1).values).toContain('hourlyRateSnapshot')
    expect(sheet.getRow(2).values).toContain(691.25)
    expect(sheet.getRow(2).values).toContain('2026-10-22')
  })
})
