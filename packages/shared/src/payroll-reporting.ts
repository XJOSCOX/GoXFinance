import { payrollSum, payrollRound } from './payroll-calculations'
import type { PayrollWeek } from './payroll'
import { payrollYtdLines } from './payroll-ytd'
export function payrollTaxReport(weeks: PayrollWeek[]) {
  const rows = weeks
      .filter((w) => w.reviewedAt && w.statement)
      .sort((a, b) => (a.statement!.payDate ?? '').localeCompare(b.statement!.payDate ?? '')),
    warnings: string[] = [],
    latest = new Map<
      string,
      {
        label: string
        code: string
        side: string
        sourceId: string
        year: string
        payDate: string
        amountCents: number | null
      }
    >()
  for (const w of rows) {
    const s = w.statement!,
      day = s.payDate!,
      year = day.slice(0, 4)
    for (const l of payrollYtdLines(s.lines)) {
      const key = [w.sourceId, year, l.side, l.code, l.component].join('|'),
        previous = latest.get(key)
      if (l.ytdCents === null) warnings.push(`${day}: ${l.label} YTD is unknown.`)
      if (
        previous?.amountCents !== null &&
        previous?.amountCents !== undefined &&
        l.ytdCents !== null &&
        l.ytdCents < previous.amountCents
      )
        warnings.push(`${day}: ${l.label} YTD decreased; verify a reset or correction.`)
      latest.set(key, {
        label: l.label,
        code: l.code,
        side: l.side,
        sourceId: w.sourceId,
        year,
        payDate: day,
        amountCents: l.ytdCents,
      })
    }
  }
  const observations = [...latest.values()]
  const latestYtd = observations.filter(
    (r) =>
      !/^FICA TAX$/i.test(r.label.trim()) ||
      !['social_security', 'medicare'].every((code) =>
        observations.some(
          (v) =>
            v.sourceId === r.sourceId &&
            v.year === r.year &&
            v.code === code &&
            v.side === 'deduction' &&
            v.amountCents !== null &&
            v.payDate >= r.payDate,
        ),
      ),
  )
  return {
    periods: rows.map((w) => ({
      weekId: w.id,
      sourceId: w.sourceId,
      payDate: w.statement!.payDate,
      grossCents: w.statement!.grossCents,
      netCents: w.statement!.netCents,
      netToGrossBps:
        w.statement!.grossCents && w.statement!.netCents !== null
          ? payrollRound(BigInt(w.statement!.netCents!) * 10000n, BigInt(w.statement!.grossCents!))
          : null,
      employeeWithholding: w.statement!.lines.filter((l) => l.side === 'deduction'),
      employerTaxes: w.statement!.lines.filter((l) => l.side === 'employer_tax'),
    })),
    latestYtd,
    warnings: [...new Set(warnings)],
    grossCents: payrollSum(rows.map((w) => w.statement!.grossCents ?? 0)),
    documentedNetCents: payrollSum(rows.map((w) => w.statement!.netCents ?? 0)),
  }
}
