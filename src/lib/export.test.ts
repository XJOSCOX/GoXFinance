import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { exampleData } from './example'
import { fromJson, toCsv, toJson, toXlsx } from './export'

describe('portable exports', () => {
  it('round trips a versioned complete JSON backup', () => {
    const original = exampleData(); const restored = fromJson(toJson(original))
    expect(restored.version).toBe(2)
    expect(restored.incomes).toEqual(original.incomes)
    expect(restored.debts).toEqual(original.debts)
    expect(restored.trading).toHaveLength(3)
    expect(() => fromJson('{"format":"goxplan","version":2}')).toThrow()
  })
  it('validates and upgrades a version 1 browser backup without losing IDs', () => {
    const source = exampleData()
    const old = { ...source, version: 1 }
    const restored = fromJson(JSON.stringify(old))
    expect(restored.version).toBe(2)
    expect(restored.debts[0].id).toBe(source.debts[0].id)
    expect(restored.debts[0].ownerType).toBe('mine')
    expect(restored.oneTimeExpenses).toEqual([])
  })
  it('exports every table to separate workbook sheets with confidence labels', async () => {
    const data = exampleData(); const binary = await toXlsx(data)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(binary)
    expect(workbook.worksheets.map(x => x.name)).toEqual(['Summary', 'Members', 'Incomes', 'Expenses', 'Debts', 'Payments', 'Settlements', 'Savings', 'Trading', 'OneTimeExpenses', 'TradingPayouts', 'Debt priorities', 'Payment schedules', 'Monthly forecast'])
    const debts = workbook.getWorksheet('Debts')!
    expect(debts.getRow(1).values).toContain('confidence')
    expect(debts.getRow(2).values).toContain('Santander')
    expect(workbook.getWorksheet('Trading')?.rowCount).toBe(4)
  })
  it('quotes CSV values safely', () => {
    const data = exampleData(); data.incomes[0].notes = 'A "quoted", note'
    expect(toCsv(data, 'incomes')).toContain('"A ""quoted"", note"')
  })
})
