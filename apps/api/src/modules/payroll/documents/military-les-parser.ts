import {
  bankDecimalCents,
  payrollStatementSchema,
  type PayrollLine,
  type PayrollStatement,
} from '@goxfinance/shared'
import type { LayoutToken } from './layout-parser'
type Row = { text: string; tokens: LayoutToken[]; y: number; page: number }
const number = (text: string) => /^-?\$?(?:\d[\d,]*)?\.\d{2}$/.test(text.trim())
const cents = (text?: string) => {
  if (!text || !number(text)) return null
  try {
    return bankDecimalCents(text.replace(/^(\$?)\./, (_, prefix: string) => prefix + '0.'))
  } catch {
    return null
  }
}
function iso(year: string, month: string, day: string) {
  const value = `${year.length === 2 ? '20' + year : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
    ? value
    : null
}
const line = (
  label: string,
  side: PayrollLine['side'],
  code: PayrollLine['code'],
  currentCents: number | null,
  ytdCents: number | null = null,
  treatment: PayrollLine['treatment'] = 'unknown',
): PayrollLine => ({
  label,
  side,
  code,
  currentCents,
  ytdCents,
  treatment,
  rateCents: null,
  hoursHundredths: null,
  worked: null,
  confidence: 'medium',
})
/** DFAS Form 702 has parallel tables, not a single current/YTD earnings table. */
export function parseMilitaryLes(rows: Row[]) {
  if (
    !rows.some((r) =>
      /DEFENSE FINANCE AND ACCOUNTING SERVICE.*MILITARY LEAVE AND EARNINGS STATEMENT/i.test(r.text),
    )
  )
    return null
  const header = rows.find((r) => /ENTITLEMENTS.*DEDUCTIONS.*ALLOTMENTS.*SUMMARY/i.test(r.text))
  if (!header) return null
  const entitlement = header.tokens.find((t) => /^ENTITLEMENTS$/i.test(t.text)),
    summary = header.tokens.find((t) => /^SUMMARY$/i.test(t.text))
  if (!entitlement || !summary || summary.x <= entitlement.x) return null
  // Normalize the published form's column positions for scaled/translated PDF pages.
  const scale = (summary.x - entitlement.x) / 443
  const x = (t: LayoutToken) => (t.x - entitlement.x) / scale + 57
  const table = rows.filter((r) => r.page === header.page && r.y < header.y)
  const bottom = table.find((r) => r.tokens.some((t) => /^TOTAL$/i.test(t.text) && x(t) < 100))
  if (!bottom) return null
  const body = table.filter((r) => r.y > bottom.y + 2 * scale)
  const summaryAmount = (pattern: RegExp) => {
    for (const r of body) {
      const cells = r.tokens.filter((t) => x(t) >= 445)
      if (pattern.test(cells.map((t) => t.text).join(' ')))
        return cents(cells.find((t) => number(t.text))?.text)
    }
    return null
  }
  const statement: PayrollStatement = {
    employer: 'Defense Finance and Accounting Service',
    assignment: null,
    periodStart: null,
    periodEnd: null,
    payDate: null,
    payFrequency: 'irregular',
    grossCents: summaryAmount(/\+TOT\s+ENT\b/i),
    deductionsCents: summaryAmount(/\+TOT\s+DED\b/i),
    netCents: summaryAmount(/=NET\s+AMT\b/i),
    lines: [],
    acknowledgement: null,
  }
  for (const r of body) {
    for (const [start, end, side] of [
      [40, 160, 'earnings'],
      [160, 340, 'deduction'],
      [340, 445, 'deduction'],
    ] as const) {
      const cells = r.tokens.filter((t) => x(t) >= start && x(t) < end)
      const amount = cells.find((t) => number(t.text))
      if (!amount) continue
      const label = cells
        .filter((t) => t.x < amount.x && !number(t.text))
        .map((t) => t.text.trim())
        .join(' ')
        .trim()
      if (!label || /amount|type|\d{5,}|account|routing/i.test(label)) continue
      const code =
        side === 'earnings'
          ? 'other_earning'
          : /FED INC TAX/i.test(label)
            ? 'federal'
            : /SGLI/i.test(label)
              ? 'insurance'
              : 'other_deduction'
      statement.lines.push(
        line(
          label,
          side,
          code,
          cents(amount.text),
          null,
          side === 'earnings'
            ? 'not_applicable'
            : /FED INC TAX|FICA TAX/i.test(label)
              ? 'posttax'
              : 'unknown',
        ),
      )
    }
  }
  // Read a named column in the next data row, never the current-period taxable wage.
  const cell = (section: RegExp, column: RegExp) => {
    const index = rows.findIndex(
      (r) => section.test(r.text) && r.tokens.some((t) => column.test(t.text)),
    )
    if (index < 0) return null
    const r = rows[index],
      token = r.tokens.find((t) => column.test(t.text))!
    const next = r.tokens.find((t) => t.x > token.x + 1)
    const data = rows[index + 1]
    if (!data || data.page !== r.page || r.y - data.y > 20 * scale) return null
    return cents(
      data.tokens.find(
        (t) => t.x >= token.x - 5 * scale && (!next || t.x < next.x - 2 * scale) && number(t.text),
      )?.text,
    )
  }
  const federal = statement.lines.find((l) => l.code === 'federal')
  if (federal) federal.ytdCents = cell(/^FED\b/i, /^Tax YTD$/i)
  const fica = statement.lines.find((l) => /^FICA TAX$/i.test(l.label))
  const social = cell(/^FICA\b/i, /^Soc Tax YTD$/i),
    medicare = cell(/^FICA\b/i, /^Med Tax YTD$/i)
  if (fica && social !== null && medicare !== null) fica.ytdCents = social + medicare
  for (const [label, value, code] of [
    ['Social security tax YTD', social, 'social_security'],
    ['Medicare tax YTD', medicare, 'medicare'],
    ['State income tax YTD', cell(/^FICA\b.*STATE/i, /^Tax YTD$/i), 'state'],
    ['TSP deferred YTD', cell(/^CONTRIBUTIONS\b/i, /^YTD TSP Deferred$/i), 'traditional'],
    ['Roth TSP YTD', cell(/^CONTRIBUTIONS\b/i, /^YTD ROTH$/i), 'roth'],
  ] as const) {
    if (value !== null)
      statement.lines.push(line(label, 'informational', code, null, value, 'not_applicable'))
  }
  const text = rows.map((r) => r.text).join('\n')
  const deposit = text.match(/DIRECT DEPOSIT DATE:\s*(\d{2})\/(\d{2})\/(\d{2,4})/i)
  if (deposit) statement.payDate = iso(deposit[3], deposit[1], deposit[2])
  // PAY DATE in the identity header is a service date, not the paycheck date.
  if (!statement.payDate) {
    const check = text.match(/\bCHK DT\s+(\d{2})(\d{2})(\d{2})\b/i)
    if (check) statement.payDate = iso(check[1], check[2], check[3])
  }
  const warnings = [
    'Military LES: confirm the pay period and frequency. Service PAY DATE and ETS are not paycheck dates. Hours and hourly rates are not reported and remain unknown.',
    'FICA is reported as a combined current deduction; separate Social Security and Medicare YTD values are informational only. Do not infer a current split.',
    'Review tax treatment of insurance, TSP and miscellaneous deductions. No tax treatment or future payment schedule is assumed.',
  ]
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ]
  const dutyDates = rows
    .filter((r) => /^INACTIVE DUTY TRAINING\b/i.test(r.text))
    .flatMap((r) =>
      [...r.text.matchAll(/\b(\d{1,2})\s+([A-Z]{3})\s+(\d{2})\b/g)].map((m) =>
        iso(m[3], String(months.indexOf(m[2]) + 1), m[1]),
      ),
    )
    .filter((d): d is string => d !== null)
    .sort()
  if (dutyDates.length) {
    statement.periodStart = dutyDates[0]
    statement.periodEnd = dutyDates.at(-1)!
    warnings.push(
      'Work-period dates are the earliest and latest explicitly listed inactive-duty training dates; confirm that they cover this payment. Training units are not hours.',
    )
  }
  for (const [pattern, label] of [
    [/YTD ENTITLE\s+([\d,]+\.\d{2})/i, 'Total entitlements YTD'],
    [/YTD DEDUCT\s+([\d,]+\.\d{2})/i, 'Total deductions YTD'],
  ] as const) {
    const value = cents(text.match(pattern)?.[1])
    if (value !== null)
      statement.lines.push(
        line(
          label,
          'informational',
          label.includes('entitlements') ? 'other_earning' : 'other_deduction',
          null,
          value,
          'not_applicable',
        ),
      )
  }
  return {
    statement: payrollStatementSchema.parse(statement),
    warnings,
    format: 'DFAS military LES (Form 702)',
  }
}
