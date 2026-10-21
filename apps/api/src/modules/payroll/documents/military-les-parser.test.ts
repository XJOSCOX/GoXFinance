import { expect, it } from 'vitest'
import PDFDocument from 'pdfkit'
import { parsePayrollLayout, type LayoutToken } from './layout-parser'
import { extractPayroll } from './local-extraction'
import { payrollReconciliation } from '@goxfinance/shared'
// Fictional amounts and dates; no personal document is stored in these fixtures.
function fixture(): LayoutToken[] {
  const tokens: LayoutToken[] = []
  const row = (y: number, cells: [number, string][]) =>
    cells.forEach(([x, text]) => tokens.push({ x, y, text, page: 1 }))
  row(770, [[20, 'DEFENSE FINANCE AND ACCOUNTING SERVICE MILITARY LEAVE AND EARNINGS STATEMENT']])
  row(750, [
    [256, 'PAY DATE'],
    [502, 'PERIOD COVERED'],
  ])
  row(740, [
    [256, '170101'],
    [502, 'CHK DT 280220'],
  ])
  row(730, [
    [57, 'ENTITLEMENTS'],
    [223, 'DEDUCTIONS'],
    [364, 'ALLOTMENTS'],
    [500, 'SUMMARY'],
  ])
  row(700, [
    [40, 'Type'],
    [130, 'Amount Type'],
    [310, 'Amount Type'],
    [412, 'Amount'],
  ])
  row(680, [
    [25, 'A'],
    [45, 'BASIC PAY'],
    [130, '1000.00'],
    [164, 'FED INC TAX'],
    [315, '100.00'],
  ])
  row(677, [
    [450, '+TOT ENT'],
    [565, '1000.00'],
  ])
  row(670, [
    [164, 'FICA TAX'],
    [315, '80.00'],
  ])
  row(660, [
    [164, 'SGLI'],
    [315, '25.00'],
    [450, '+TOT DED'],
    [565, '400.00'],
  ])
  row(650, [
    [164, 'MISC DEDUCTIONS'],
    [315, '120.00'],
  ])
  row(640, [
    [164, 'TSP CONTRIBUTION'],
    [315, '75.00'],
  ])
  row(630, [
    [450, '=NET AMT'],
    [565, '600.00'],
  ])
  row(550, [
    [57, 'TOTAL'],
    [130, '1000.00'],
    [315, '400.00'],
  ])
  row(535, [
    [16, 'FED'],
    [126, 'Wage YTD'],
    [553, 'Tax YTD'],
  ])
  row(525, [
    [16, 'TAXES'],
    [132, '8000.00'],
    [558, '800.00'],
  ])
  row(515, [
    [16, 'FICA'],
    [118, 'Soc Wage YTD'],
    [182, 'Soc Tax YTD'],
    [296, 'Med Tax YTD'],
    [348, 'STATE'],
    [553, 'Tax YTD'],
  ])
  row(505, [
    [16, 'TAXES'],
    [132, '9000.00'],
    [195, '550.00'],
    [312, '130.00'],
    [564, '.00'],
  ])
  row(435, [
    [16, 'CONTRIBUTIONS'],
    [94, 'YTD Deductions'],
    [163, 'YTD TSP Deferred'],
    [323, 'YTD ROTH'],
  ])
  row(425, [
    [16, 'TOTALS'],
    [112, '650.00'],
    [186, '650.00'],
    [338, '.00'],
  ])
  row(370, [
    [16, 'REMARKS:'],
    [125, 'YTD ENTITLE'],
    [178, '9000.00'],
    [270, 'YTD DEDUCT'],
    [323, '3000.00'],
  ])
  row(340, [[22, 'DIRECT DEPOSIT DATE: 02/20/28 AMOUNT: $600.00']])
  row(260, [[22, 'INACTIVE DUTY TRAINING 05 FEB 28 1 06 FEB 28 2']])
  row(230, [[22, 'Employee 123456789 bank account 987654321']])
  return tokens
}
it('reads parallel LES tables and separates current amounts from cumulative tax and TSP data', () => {
  const { statement: s, warnings, format } = parsePayrollLayout(fixture())
  expect(format).toContain('DFAS')
  expect(s).toMatchObject({
    employer: 'Defense Finance and Accounting Service',
    grossCents: 100000,
    deductionsCents: 40000,
    netCents: 60000,
    payDate: '2028-02-20',
    periodStart: '2028-02-05',
    periodEnd: '2028-02-06',
    payFrequency: 'irregular',
  })
  expect(s.lines.filter((l) => l.side === 'earnings')).toHaveLength(1)
  expect(s.lines.filter((l) => l.side === 'deduction')).toHaveLength(5)
  expect(s.lines.find((l) => l.code === 'federal')).toMatchObject({
    currentCents: 10000,
    ytdCents: 80000,
  })
  expect(s.lines.find((l) => l.label === 'FICA TAX')).toMatchObject({
    currentCents: 8000,
    ytdCents: 68000,
  })
  expect(s.lines.find((l) => l.label === 'TSP deferred YTD')).toMatchObject({
    side: 'informational',
    currentCents: null,
    ytdCents: 65000,
  })
  expect(s.lines.find((l) => l.label === 'State income tax YTD')?.ytdCents).toBe(0)
  expect(s.lines.find((l) => l.label === 'Total entitlements YTD')?.ytdCents).toBe(900000)
  expect(s.lines.every((l) => l.hoursHundredths === null && l.rateCents === null)).toBe(true)
  expect(payrollReconciliation(s)).toEqual([
    'Unrecognized classification or tax treatment requires review.',
  ])
  expect(warnings.some((w) => w.includes('Training units are not hours'))).toBe(true)
  expect(JSON.stringify(s)).not.toMatch(/123456789|987654321/)
})
it('supports translated and scaled form columns', () => {
  const s = parsePayrollLayout(
    fixture().map((t) => ({ ...t, x: t.x * 1.5 + 18, y: t.y * 1.5 })),
  ).statement
  expect(s.grossCents).toBe(100000)
  expect(s.lines.find((l) => l.code === 'federal')?.ytdCents).toBe(80000)
})
it('uses CHK DT when no deposit date is printed and never substitutes service PAY DATE or guessed work dates', () => {
  const without = fixture().filter(
    (t) => !t.text.includes('DIRECT DEPOSIT') && !t.text.includes('INACTIVE DUTY'),
  )
  expect(parsePayrollLayout(without).statement).toMatchObject({
    payDate: '2028-02-20',
    periodStart: null,
    periodEnd: null,
  })
  expect(
    parsePayrollLayout(without.filter((t) => !t.text.includes('CHK DT'))).statement.payDate,
  ).toBeNull()
  expect(
    parsePayrollLayout(
      fixture().map((t) =>
        t.text.includes('DIRECT DEPOSIT') ? { ...t, text: 'DIRECT DEPOSIT DATE: 02/30/28' } : t,
      ),
    ).statement.payDate,
  ).toBe('2028-02-20')
})
it('keeps missing amounts unknown and exposes inconsistent totals for review', () => {
  const missing = fixture().filter((t) => t.text !== '=NET AMT' && t.text !== '600.00')
  expect(parsePayrollLayout(missing).statement.netCents).toBeNull()
  const mismatched = fixture().map((t) =>
    t.text === '400.00' && t.x === 565 ? { ...t, text: '399.00' } : t,
  )
  expect(payrollReconciliation(parsePayrollLayout(mismatched).statement)).toContain(
    'Current-period deductions lines differ from the statement total.',
  )
  expect(parsePayrollLayout(fixture().filter((t) => t.text !== 'TOTAL')).format).not.toContain(
    'DFAS',
  )
})
it('extracts a synthetic LES PDF through the actual PDF upload parser', async () => {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0 }),
    chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve) => {
    doc.on('data', (b) => chunks.push(b))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
  for (const t of fixture()) doc.fontSize(5).text(t.text, t.x, 790 - t.y, { lineBreak: false })
  doc.end()
  const result = await extractPayroll(new Uint8Array(await done), 'application/pdf')
  expect(result.statement.netCents).toBe(60000)
  expect(result.statement.payDate).toBe('2028-02-20')
  expect(result.statement.lines.find((l) => l.code === 'federal')?.ytdCents).toBe(80000)
})
