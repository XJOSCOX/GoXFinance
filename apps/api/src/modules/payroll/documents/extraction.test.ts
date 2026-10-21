import { expect, it } from 'vitest'
import PDFDocument from 'pdfkit'
import { createCanvas } from '@napi-rs/canvas'
import { extractPayroll, validatePayrollFile } from './local-extraction'
import { parsePayrollLayout, type LayoutToken } from './layout-parser'
import { payrollReconciliation } from '@goxfinance/shared'
import { localDocumentPreview } from './document.service'
function synthetic() {
  const t: LayoutToken[] = []
  const row = (y: number, values: [number, string][]) =>
    values.forEach(([x, text]) => t.push({ x, y, text, page: 1 }))
  row(760, [[30, 'HireArt Inc.']])
  row(730, [
    [410, 'Beginning'],
    [545, '10/05/2026'],
  ])
  row(716, [
    [410, 'Ending'],
    [545, '10/11/2026'],
  ])
  row(700, [
    [410, 'Pay date'],
    [545, '10/16/2026'],
  ])
  row(600, [[30, 'Earnings']])
  row(580, [
    [140, 'Description'],
    [348, 'Rate'],
    [425, 'Hours'],
    [488, 'Amount'],
    [544, 'Year to date'],
  ])
  row(560, [
    [37, 'Regular'],
    [342, '$25.00'],
    [428, '40.00'],
    [489, '$1,000.00'],
    [548, '$9,000.00'],
  ])
  row(545, [
    [37, 'Short term disability (pre-tax)'],
    [489, '$10.00'],
    [548, '$90.00'],
  ])
  row(530, [
    [30, 'Gross pay'],
    [489, '$1,010.00'],
    [548, '$9,090.00'],
  ])
  row(500, [[30, 'Deductions']])
  row(480, [
    [37, 'Federal income tax'],
    [489, '$100.00'],
    [548, '$900.00'],
  ])
  row(465, [
    [37, 'Short Term Disability (post-tax deduction)'],
    [489, '$10.00'],
    [548, '$90.00'],
  ])
  row(450, [
    [37, 'Roth 401(k) (post-tax deduction)'],
    [489, '$50.00'],
    [548, '$450.00'],
  ])
  row(420, [
    [30, 'Net pay'],
    [489, '$850.00'],
    [548, '$7,650.00'],
  ])
  return t
}
it('parses separate current/YTD columns and preserves earnings-side disability and corresponding deductions', () => {
  const r = parsePayrollLayout(synthetic())
  expect(r.statement).toMatchObject({
    grossCents: 101000,
    deductionsCents: 16000,
    netCents: 85000,
    periodStart: '2026-10-05',
    periodEnd: '2026-10-11',
    payDate: '2026-10-16',
  })
  expect(r.statement.lines[0]).toMatchObject({
    currentCents: 100000,
    ytdCents: 900000,
    rateCents: 2500,
    hoursHundredths: 4000,
  })
  expect(
    r.statement.lines.filter((l) => l.code === 'disability').map((l) => [l.side, l.treatment]),
  ).toEqual([
    ['earnings', 'pretax'],
    ['deduction', 'posttax'],
  ])
  expect(r.statement.lines.find((l) => l.code === 'roth')?.currentCents).toBe(5000)
  expect(payrollReconciliation(r.statement)).toEqual([])
})
it('keeps a negative deduction convention, displaced totals and unrelated footer wording separate', () => {
  const tokens = synthetic().map((t) =>
    t.x === 489 && t.y < 500 && t.y > 420
      ? { ...t, text: '-' + t.text }
      : t.x === 489 && t.y === 530
        ? { ...t, x: 342 }
        : t,
  )
  tokens.push({ text: 'Account ending in masked identifier', x: 30, y: 300, page: 1 })
  const r = parsePayrollLayout(tokens)
  expect(r.statement).toMatchObject({
    periodEnd: '2026-10-11',
    deductionSign: 'negative',
    deductionsCents: 16000,
    grossCents: 101000,
  })
  expect(payrollReconciliation(r.statement)).toEqual([])
})
it('extracts a synthetic text PDF locally without retaining unrelated identity fields', async () => {
  const document = new PDFDocument({ size: 'LETTER', margin: 0 }),
    chunks: Buffer[] = []
  const complete = new Promise<Buffer>((resolve) => {
    document.on('data', (b) => chunks.push(b))
    document.on('end', () => resolve(Buffer.concat(chunks)))
  })
  document.fontSize(8)
  for (const t of synthetic()) document.text(t.text, t.x, 792 - t.y, { lineBreak: false })
  document.text('Fictional Private Person 123-45-6789', 30, 40)
  document.end()
  const bytes = await complete
  const r = await extractPayroll(new Uint8Array(bytes), 'application/pdf')
  expect(r.usedOcr).toBe(false)
  expect(r.statement.grossCents).toBe(101000)
  expect(JSON.stringify(r)).not.toMatch(/Private Person|123-45-6789/)
  expect(r.statement.lines.find((l) => l.code === 'roth')).toBeDefined()
  const preview = await localDocumentPreview('fictional-worker-test', {
    mime: 'application/pdf',
    data: bytes.toString('base64'),
  })
  expect(preview.statement.grossCents).toBe(101000)
  expect(preview.documentDigest).toMatch(/^[a-f0-9]{64}$/)
}, 15000)
it('runs real offline OCR on a synthetic image using bundled English data', async () => {
  const canvas = createCanvas(1400, 600),
    ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, 1400, 600)
  ctx.fillStyle = 'black'
  ctx.font = '36px Arial'
  ctx.fillText('Earnings', 40, 80)
  ctx.fillText('Regular', 40, 150)
  ctx.fillText('1000.00', 850, 150)
  ctx.fillText('Gross pay', 40, 220)
  ctx.fillText('1000.00', 850, 220)
  ctx.fillText('Net pay', 40, 300)
  ctx.fillText('800.00', 850, 300)
  const r = await extractPayroll(new Uint8Array(canvas.toBuffer('image/png')), 'image/png')
  expect(r.usedOcr).toBe(true)
  expect(r.warnings.some((w) => w.includes('OCR'))).toBe(true)
  expect(r.statement.grossCents).toBe(100000)
  const scanned = new PDFDocument({ size: 'LETTER', margin: 0 }),
    parts: Buffer[] = []
  const done = new Promise<Buffer>((resolve) => {
    scanned.on('data', (b) => parts.push(b))
    scanned.on('end', () => resolve(Buffer.concat(parts)))
  })
  scanned.image(canvas.toBuffer('image/png'), 0, 0, { width: 600 })
  scanned.end()
  const scannedResult = await extractPayroll(new Uint8Array(await done), 'application/pdf')
  expect(scannedResult.usedOcr).toBe(true)
  expect(scannedResult.statement.grossCents).toBe(100000)
}, 30000)
it('rejects mismatched contents and excessive uploads', () => {
  expect(() => validatePayrollFile(new Uint8Array(16), 'application/pdf')).toThrow()
  expect(() => validatePayrollFile(new Uint8Array(11 * 1024 * 1024), 'image/png')).toThrow()
})

it('detects explicitly labeled employer and frequency without assuming an employee name is the employer', () => {
  const parsed = parsePayrollLayout([
    { page: 1, x: 30, y: 760, text: 'Employer: Fictional Payroll LLC' },
    { page: 1, x: 30, y: 740, text: 'Pay frequency: Semi-monthly' },
    { page: 1, x: 30, y: 720, text: 'Employee: Fictional Person' },
  ])
  expect(parsed.statement.employer).toBe('Fictional Payroll LLC')
  expect(parsed.statement.payFrequency).toBe('semimonthly')
  expect(
    parsePayrollLayout([{ page: 1, x: 30, y: 760, text: 'Employee: Fictional Person' }]).statement
      .employer,
  ).toBeNull()
})
