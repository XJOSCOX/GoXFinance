import PDFDocument from 'pdfkit'
import { reportDisplay, type FinancialReport } from '@goxfinance/shared'
const text = (v: string) =>
  [...v].filter((c) => c.charCodeAt(0) >= 32 || c === '\n' || c === '\t').join('')
export function reportPdf(report: FinancialReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 44,
        bufferPages: true,
        info: { Title: 'GoXFinance financial report', Author: 'GoXFinance' },
      }),
      chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    function line(value: string, size = 10, color = '#303b35', gap = 7) {
      doc.font('Helvetica').fontSize(size).fillColor(color)
      const safe = text(value),
        height = doc.heightOfString(safe, { width: 507 })
      if (doc.y + height > doc.page.height - 66) doc.addPage()
      doc.text(safe, { width: 507, lineGap: 2 })
      doc.moveDown(gap / size)
    }
    line('GoXFinance', 24, '#1e3327')
    line('Financial report | ' + report.filters.from + ' through ' + report.filters.to, 13)
    line(report.householdName + ' | ' + report.scope)
    line('Generated UTC: ' + report.generatedAt + ' | Schema 1')
    line('NOT A RESTORABLE SQLITE BACKUP', 10, '#8a4a14')
    for (const n of report.notes) line(n, 9, '#59635d', 5)
    for (const t of report.tables) {
      if (doc.y > doc.page.height - 150) doc.addPage()
      line(t.name, 16, '#1e3327', 10)
      line(t.basis, 9, '#59635d')
      if (!t.rows.length) line('No records in this scope.', 10, '#59635d')
      t.rows.forEach((r, i) => {
        doc.font('Helvetica').fontSize(9)
        const height =
          28 +
          t.columns.reduce(
            (n, c) =>
              n +
              doc.heightOfString(
                c.label.replace(' (cents)', '') + ': ' + reportDisplay(r[c.key] ?? null, c.unit),
                { width: 507, lineGap: 2 },
              ) +
              5,
            0,
          )
        if (height < doc.page.height - 110 && doc.y + height > doc.page.height - 66) doc.addPage()
        line('Record ' + (i + 1), 10, '#1e3327', 3)
        for (const c of t.columns)
          line(
            c.label.replace(' (cents)', '') + ': ' + reportDisplay(r[c.key] ?? null, c.unit),
            9,
            '#303b35',
            3,
          )
        doc.moveDown(0.6)
      })
    }
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i)
      doc
        .fontSize(8)
        .fillColor('#59635d')
        .text(
          `GoXFinance | Sensitive financial information | ${i + 1} / ${pages.count}`,
          44,
          doc.page.height - 42,
          { lineBreak: false },
        )
    }
    doc.end()
  })
}
