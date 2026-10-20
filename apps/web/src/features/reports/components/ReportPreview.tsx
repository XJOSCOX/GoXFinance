import { reportDisplay, type FinancialReport } from '@goxfinance/shared'
export function ReportPreview({ report }: { report: FinancialReport }) {
  return (
    <section className="space-y-3" aria-label="Report preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {report.householdName} · {report.filters.from} — {report.filters.to}
        </h2>
        <span className="text-xs text-slate-400">{report.scope}</span>
      </div>
      <p className="text-xs text-slate-500">
        Generated {new Date(report.generatedAt).toLocaleString()} · Schema {report.schemaVersion} ·
        Financial export, not a SQLite backup
      </p>
      <details className="rounded-lg border border-white/10 p-3">
        <summary className="cursor-pointer text-sm">Data basis and limitations</summary>
        <ul className="mt-2 space-y-2 text-xs text-slate-400">
          {report.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
      {report.tables.map((t, index) => (
        <details
          key={t.name}
          open={index === 0}
          className="min-w-0 rounded-xl border border-white/10 bg-white/[.025]"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {t.name}
            <span className="ml-2 text-xs font-normal text-slate-500">{t.rows.length} records</span>
          </summary>
          <div className="px-4 pb-4">
            <p className="mb-3 text-xs text-slate-400">{t.basis}</p>
            {!t.rows.length ? (
              <p className="text-sm text-slate-500">No records in this scope.</p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#232825] text-slate-300">
                    <tr>
                      {t.columns.map((c) => (
                        <th key={c.key} className="whitespace-nowrap px-3 py-3 font-medium">
                          {c.label.replace(' (cents)', '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {t.columns.map((c) => (
                          <td
                            key={c.key}
                            className={`max-w-72 break-words px-3 py-2.5 ${c.unit === 'cents' || c.key === 'month' ? 'whitespace-nowrap tabular-nums' : ''}`}
                          >
                            {reportDisplay(r[c.key] ?? null, c.unit)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      ))}
    </section>
  )
}
