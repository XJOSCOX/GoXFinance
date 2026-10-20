import type { FinancialReport, ReportValue } from '@goxfinance/shared'
// Strings only: numeric negative cents remain numbers. Neutralize formulas even after whitespace.
export function csvCell(value: ReportValue) {
  let text =
    value === null
      ? 'Unknown'
      : [...String(value)].filter((c) => c.charCodeAt(0) >= 32 || '\t\r\n'.includes(c)).join('')
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
export function reportCsv(report: FinancialReport) {
  const rows: ReportValue[][] = [
    ['Section', 'Row', 'Field', 'Value', 'Unit', 'Basis'],
    [
      'Metadata',
      0,
      'schemaVersion',
      report.schemaVersion,
      'number',
      'Financial report, not SQLite backup',
    ],
    ['Metadata', 0, 'generatedAt', report.generatedAt, 'UTC', ''],
    ['Metadata', 0, 'household', report.householdName, 'text', report.scope],
    ['Metadata', 0, 'from', report.filters.from, 'date', ''],
    ['Metadata', 0, 'to', report.filters.to, 'date', ''],
    ['Metadata', 0, 'filters', JSON.stringify(report.filters), 'text', ''],
    ...report.notes.map((note, i) => ['Notes', i + 1, 'note', note, 'text', '']),
  ]
  for (const t of report.tables) {
    if (!t.rows.length) rows.push([t.name, 0, 'Records', 0, 'number', t.basis])
    t.rows.forEach((r, i) =>
      t.columns.forEach((c) =>
        rows.push([t.name, i + 1, c.label, r[c.key] ?? null, c.unit, t.basis]),
      ),
    )
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
