import {
  bankDecimalCents,
  payrollStatementSchema,
  type PayrollLine,
  type PayrollStatement,
} from '@goxfinance/shared'
export type LayoutToken = { text: string; x: number; y: number; page: number }
type Row = { text: string; tokens: LayoutToken[]; y: number; page: number }
export function layoutRows(tokens: LayoutToken[]): Row[] {
  const rows: Row[] = []
  for (const t of [...tokens]
    .filter((t) => t.text.trim())
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    let row = rows.find((r) => r.page === t.page && Math.abs(r.y - t.y) < 2)
    if (!row) {
      row = { text: '', tokens: [], y: t.y, page: t.page }
      rows.push(row)
    }
    row.tokens.push(t)
    row.tokens.sort((a, b) => a.x - b.x)
    row.text = row.tokens.map((v) => v.text).join(' ')
  }
  return rows
}
const money = (v: string | undefined) => {
  if (!v) return null
  try {
    return bankDecimalCents(v.trim().replace(/^\((.*)\)$/, '-$1'))
  } catch {
    return null
  }
}
const date = (text: string) => {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (!m) return null
  const result = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(result) &&
    !isNaN(Date.parse(result)) &&
    new Date(result).toISOString().slice(0, 10) === result
    ? result
    : null
}
function code(label: string, side: PayrollLine['side']): PayrollLine['code'] {
  const s = label.toLowerCase()
  if (/adjustment/.test(s)) return 'adjustment'
  if (/overtime/.test(s)) return 'overtime'
  if (/regular/.test(s)) return 'regular'
  if (/paid time|\bpto\b/.test(s)) return 'pto'
  if (/holiday/.test(s)) return 'holiday'
  if (/bonus/.test(s)) return 'bonus'
  if (/federal/.test(s)) return 'federal'
  if (/social security/.test(s)) return 'social_security'
  if (/medicare/.test(s)) return 'medicare'
  if (/roth/.test(s)) return 'roth'
  if (/401/.test(s)) return 'traditional'
  if (/disability/.test(s)) return 'disability'
  if (/insurance/.test(s)) return 'insurance'
  if (/state.*tax/.test(s)) return 'state'
  if (/local.*tax/.test(s)) return 'local'
  return side === 'earnings' ? 'other_earning' : 'unknown'
}
const safeLabel = (text: string) =>
  text
    .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, '[redacted]')
    .replace(/\b\d{5,}\b/g, '[redacted]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]+\b/g, '[redacted]')
    .slice(0, 160)
export function parsePayrollLayout(tokens: LayoutToken[]): {
  statement: PayrollStatement
  warnings: string[]
  format: string
} {
  const rows = layoutRows(tokens),
    hireart = rows.some((r) => /hireart/i.test(r.text)),
    warnings: string[] = [],
    statement: PayrollStatement = {
      employer: hireart ? 'HireArt Inc.' : null,
      assignment: null,
      periodStart: null,
      periodEnd: null,
      payDate: null,
      grossCents: null,
      deductionsCents: null,
      netCents: null,
      lines: [],
      acknowledgement: null,
    }
  let side: PayrollLine['side'] | null = null,
    currentX: number | null = null,
    ytdX: number | null = null,
    rateX: number | null = null,
    hoursX: number | null = null,
    netAfter = false
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i],
      low = r.text.toLowerCase()
    const assignmentLabel = r.tokens.findIndex((t) =>
      /^(assignment|client)\s*:?$/i.test(t.text.trim()),
    )
    if (assignmentLabel >= 0 && r.tokens[assignmentLabel + 1])
      statement.assignment = safeLabel(r.tokens[assignmentLabel + 1].text)
    if (/\bbeginning\b|period start/.test(low) && date(r.text)) statement.periodStart = date(r.text)
    if (/\bending\b|period end/.test(low) && date(r.text)) statement.periodEnd = date(r.text)
    if (/pay date|check date/.test(low))
      statement.payDate = date(r.text) ?? date(rows[i + 1]?.text ?? '')
    if (/pay period/.test(low) && r.text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g)?.length === 2) {
      const dates = r.text.match(/\d{1,2}\/\d{1,2}\/\d{4}/g)!
      statement.periodStart = date(dates[0])
      statement.periodEnd = date(dates[1])
    }
    if (/^earnings\b/.test(low) && !/^earnings statement/.test(low)) {
      side = 'earnings'
      netAfter = false
      continue
    }
    if (/^deductions\b/.test(low)) {
      side = 'deduction'
      continue
    }
    if (/^employer.*tax/.test(low)) {
      side = 'employer_tax'
      continue
    }
    const ytd = r.tokens.find((t) => /year.to.date|\bytd\b/i.test(t.text)),
      current = r.tokens.find((t) => /^(amount|current|this period)$/i.test(t.text)),
      rate = r.tokens.find((t) => /^rate$/i.test(t.text)),
      hours = r.tokens.find((t) => /^hours$/i.test(t.text))
    if (ytd) ytdX = ytd.x
    if (current) currentX = current.x
    if (rate) rateX = rate.x
    if (hours) hoursX = hours.x
    const numeric = r.tokens.filter((t) =>
        /^\(?-?\$?\d[\d,]*(?:\.\d{1,2})?\)?$/.test(t.text.trim()),
      ),
      currentToken =
        currentX !== null
          ? numeric.find((t) => t.x >= currentX! - 18 && (ytdX === null || t.x < ytdX - 8))
          : numeric.length === 1
            ? numeric[0]
            : undefined,
      ytdToken = ytdX !== null ? numeric.find((t) => t.x >= ytdX! - 8) : undefined
    if (/^(total\s+)?worked hours\b/.test(low)) {
      statement.reportedWorkedHundredths = money((currentToken ?? numeric[0])?.text)
      continue
    }
    if (/^(total\s+)?paid hours\b/.test(low)) {
      statement.reportedPaidHundredths = money((currentToken ?? numeric[0])?.text)
      continue
    }
    if (/^gross pay\b|^total gross\b/.test(low)) {
      statement.grossCents =
        money(currentToken?.text) ??
        money(numeric.find((t) => ytdX === null || t.x < ytdX - 8)?.text)
      side = null
      continue
    }
    if (/^net pay\b/.test(low)) {
      statement.netCents =
        money(currentToken?.text) ?? (numeric.length === 1 ? money(numeric[0].text) : null)
      side = null
      netAfter = true
      continue
    }
    if (/^total deductions\b/.test(low)) {
      statement.deductionsCents = money(currentToken?.text)
      continue
    }
    if (
      netAfter ||
      !side ||
      !currentToken ||
      ytd ||
      current ||
      rate ||
      hours ||
      /^statutory\b|^other deductions\b/.test(low)
    )
      continue
    // Restrict to financial table cells; no employee/address/bank sections are returned.
    const labels = r.tokens.filter(
        (t) => t.x < (rateX ?? currentX ?? 300) - 15 && !numeric.includes(t),
      ),
      label = (labels[0]?.text ?? '').trim()
    if (!label || /\d{5,}|@|address|account|routing|employee/i.test(label)) continue
    const classification = code(label, side),
      rateToken = rateX === null ? undefined : numeric.find((t) => Math.abs(t.x - rateX!) < 25),
      hoursToken = hoursX === null ? undefined : numeric.find((t) => Math.abs(t.x - hoursX!) < 25),
      worked = ['regular', 'overtime'].includes(classification)
        ? true
        : ['pto', 'holiday'].includes(classification)
          ? false
          : null
    statement.lines.push({
      label: safeLabel(label),
      side,
      code: classification,
      treatment: /pre[ -]?tax/i.test(label)
        ? 'pretax'
        : /post[ -]?tax/i.test(label) ||
            ['federal', 'social_security', 'medicare', 'state', 'local'].includes(classification)
          ? 'posttax'
          : side === 'earnings'
            ? 'not_applicable'
            : 'unknown',
      currentCents: money(currentToken.text),
      ytdCents: money(ytdToken?.text),
      rateCents: money(rateToken?.text),
      hoursHundredths: hoursToken ? money(hoursToken.text) : null,
      worked,
      confidence: hireart && currentX !== null && ytdX !== null ? 'high' : 'low',
    })
  }
  if (statement.deductionsCents === null && statement.lines.some((l) => l.side === 'deduction')) {
    const lines = statement.lines.filter((l) => l.side === 'deduction')
    if (lines.every((l) => l.currentCents !== null)) {
      const rawTotal = lines.reduce((n, l) => n + BigInt(l.currentCents!), 0n)
      const negativeConvention =
        hireart && lines.every((l) => (l.currentCents ?? 0) <= 0) && rawTotal < 0n
      statement.deductionSign = negativeConvention ? 'negative' : 'positive'
      const total = negativeConvention ? -rawTotal : rawTotal
      if (total >= 0 && total <= BigInt(Number.MAX_SAFE_INTEGER))
        statement.deductionsCents = Number(total)
      warnings.push(
        'Employee deduction total is summed from extracted current lines; verify against the statement.',
      )
    }
  }
  if (!hireart)
    warnings.push(
      'Generic layout: employer and every amount require manual verification. Unknown layouts may require manual entry.',
    )
  if (statement.lines.length === 0)
    warnings.push(
      'No reliable financial table detected. Enter the statement manually; source text is not retained.',
    )
  if (statement.lines.some((l) => l.code === 'unknown' || l.confidence === 'low'))
    warnings.push('Review unrecognized or low-confidence components.')
  return {
    statement: payrollStatementSchema.parse(statement),
    warnings,
    format: hireart ? 'HireArt earnings table' : 'Generic manual-review fallback',
  }
}
