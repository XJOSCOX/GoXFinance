import { expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { FinancialReport } from '@goxfinance/shared'
import { reportCsv, csvCell } from './report.csv'
import { reportXlsx } from './report.xlsx'
import { reportPdf } from './report.pdf'
import { table } from './report.tables'
const report: FinancialReport = {
  schemaVersion: 1,
  kind: 'financial_report_export',
  restorable: false,
  generatedAt: '2026-10-20T12:00:00Z',
  householdId: 'fictional-test',
  householdName: 'Fictional household',
  scope: 'Household',
  filters: {
    kind: 'all',
    from: '2026-10-01',
    to: '2026-10-31',
    memberId: null,
    categoryId: null,
    debtId: null,
    accountId: null,
    groupId: null,
  },
  notes: ['Sensitive financial export; not encrypted.'],
  tables: [
    table('Fictional input', 'Confirmed test records', [
      {
        description: '=HYPERLINK("https://example.invalid")',
        amountCents: 34218,
        remainingCents: 14218,
        unknownCents: null,
        largeCents: Number.MAX_SAFE_INTEGER,
      },
      {
        description: '<script>test</script>',
        amountCents: -100,
        remainingCents: 0,
        unknownCents: null,
        largeCents: 0,
      },
    ]),
  ],
}
it('mitigates CSV formulas and preserves quotes, exact cents, unknowns and negative numeric amounts', () => {
  for (const value of [
    '=1+1',
    ' +SUM(A1:A2)',
    '-2+1',
    '@cmd',
    '\t=1',
    '\r=1',
    '\uFEFF=1',
    '\u0000=1',
  ])
    expect(csvCell(value)).toContain("'")
  expect(csvCell(-100)).toBe('"-100"')
  expect(csvCell('safe,"text"')).toBe('"safe,""text"""')
  const csv = reportCsv(report)
  expect(csv).toContain("'=HYPERLINK")
  expect(csv).toContain('34218')
  expect(csv).toContain('Unknown')
  expect(csv).toContain('9007199254740991')
})
it('roundtrips an XLSX with typed inert text, unknowns and high-precision integer cents', async () => {
  const buffer = await reportXlsx(report),
    book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = book.worksheets[1]
  expect(sheet.getCell('A3').value).toBe('=HYPERLINK("https://example.invalid")')
  expect(sheet.getCell('A3').type).toBe(ExcelJS.ValueType.String)
  expect(sheet.getCell('B3').value).toBe(34218)
  expect(sheet.getCell('D3').value).toBe('Unknown')
  expect(sheet.getCell('E3').value).toBe('9007199254740991')
  expect(sheet.getCell('B4').value).toBe(-100)
  expect(book.worksheets[0].getCell('B1').value).toContain('Not a restorable SQLite backup')
  for (const s of book.worksheets)
    s.eachRow((r) => r.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)))
})
it('creates a complete multi-page PDF with literal text and no active JavaScript or embedded data', async () => {
  const many = {
    ...report,
    tables: [
      table(
        'Fictional long report',
        'Test pagination',
        Array.from({ length: 40 }, (_, i) => ({
          name: 'Fictional record ' + i,
          valueCents: i * 101,
          notes: 'Literal <script> text, not active HTML.',
        })),
      ),
    ],
  }
  const pdf = await reportPdf(many)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.toString('latin1')).toContain('%%EOF')
  expect(pdf.toString('latin1')).not.toMatch(/\/JavaScript|\/OpenAction|\/EmbeddedFile/)
})
