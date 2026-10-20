import ExcelJS from 'exceljs'
import type { FinancialReport } from '@goxfinance/shared'
export async function reportXlsx(report: FinancialReport) {
  const book = new ExcelJS.Workbook()
  book.creator = 'GoXFinance'
  book.created = new Date(report.generatedAt)
  const meta = book.addWorksheet('Read me')
  meta.addRows([
    ['GoXFinance financial report', 'Not a restorable SQLite backup'],
    ['Schema version', report.schemaVersion],
    ['Generated UTC', report.generatedAt],
    ['Household', report.householdName],
    ['Scope', report.scope],
    ['From', report.filters.from],
    ['Through', report.filters.to],
    ['Filters', JSON.stringify(report.filters)],
    ['Money', 'Integer cents. Values exceeding Excel precision are exact text. Unknown is text.'],
    ...report.notes.map((n) => ['Note', n]),
  ])
  meta.columns = [{ width: 24 }, { width: 100 }]
  report.tables.forEach((t, i) => {
    const sheet = book.addWorksheet(
      `${i + 1} ${t.name}`
        .slice(0, 31)
        .split('')
        .map((c) => ('[]*?:/\\'.includes(c) ? ' ' : c))
        .join(''),
    )
    sheet.addRow([t.basis])
    sheet.addRow(t.columns.map((c) => c.label))
    for (const r of t.rows)
      sheet.addRow(
        t.columns.map((c) => {
          const value = r[c.key]
          return value == null
            ? 'Unknown'
            : typeof value === 'number' && Math.abs(value) >= 1e15
              ? String(value)
              : value
        }),
      )
    if (!t.rows.length) sheet.addRow(['No records in this scope'])
    sheet.views = [{ state: 'frozen', ySplit: 2 }]
    if (t.columns.length)
      sheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: Math.max(2, sheet.rowCount), column: t.columns.length },
      }
    sheet.columns = t.columns.length
      ? t.columns.map((c) => ({
          width: c.unit === 'cents' ? 23 : Math.min(42, Math.max(22, c.label.length + 2)),
        }))
      : [{ width: 100 }]
    if (t.columns.length > 1) sheet.mergeCells(1, 1, 1, t.columns.length)
  })
  for (const sheet of book.worksheets) {
    sheet.eachRow((row, index) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true }
        cell.font = { name: 'Calibri', size: 11 }
        if (index <= (sheet === meta ? 1 : 2)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF202724' } }
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFF1F4F1' } }
        }
      })
      let lines = 1
      row.eachCell((cell, col) => {
        if (cell.isMerged && col !== 1) return
        const width =
          sheet !== meta && index === 1
            ? sheet.columns.reduce((n, c) => n + (c.width ?? 22), 0)
            : (sheet.getColumn(col).width ?? 22)
        lines = Math.max(
          lines,
          ...cell.text.split('\n').map((t) => Math.ceil(t.length / Math.max(5, width - 3))),
        )
      })
      row.height = Math.min(409, Math.max(index <= 2 ? 32 : 28, lines * 16 + 8))
    })
    sheet.properties.defaultRowHeight = 28
  }
  return Buffer.from(await book.xlsx.writeBuffer())
}
