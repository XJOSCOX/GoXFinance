import { useEffect, useState } from 'react'
import { localBillDate, type categoryReport, type FinancialCategory } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { apiRequest, errorMessage } from '../../../lib/api'
import { formatMoney } from '../../../lib/money'

export function CategoryTotals({
  home,
  categories,
}: {
  home: string
  categories: FinancialCategory[]
}) {
  const [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [rows, setRows] = useState<ReturnType<typeof categoryReport> | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setRows(null)
    setError('')
    void apiRequest<{ rows: ReturnType<typeof categoryReport> }>(
      `households/${home}/categories/report?month=${encodeURIComponent(month)}`,
    )
      .then((result) => {
        if (active) setRows(result.rows)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
    return () => {
      active = false
    }
  }, [home, month, categories])
  return (
    <section aria-label="Separate category totals" className="mt-3 space-y-3">
      <label className="block text-xs text-slate-400">
        Spending and cash-outflow month
        <Input
          type="month"
          required
          value={month}
          onChange={(event) => {
            if (event.target.value) setMonth(event.target.value)
          }}
        />
      </label>
      <p className="text-xs text-slate-500">
        Plan is the current monthly equivalent, including estimates. Debt is the current known
        balance. Purchases and completed cash outflows use the selected month. These columns are
        separate measures, not amounts to add together.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {rows === null && !error && (
        <p role="status" className="text-sm text-slate-400">
          Loading totals…
        </p>
      )}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">Category</th>
                <th className="p-2">Expected / month</th>
                <th className="p-2">Purchases</th>
                <th className="p-2">Cash paid</th>
                <th className="p-2">Debt balances</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoryId ?? 'uncategorized'} className="border-t border-white/10">
                  <th scope="row" className="p-2 font-medium">
                    {categories.find((category) => category.id === row.categoryId)?.name ??
                      'Uncategorized'}
                  </th>
                  <td className="p-2 tabular-nums">
                    {formatMoney(row.expectedCents)}
                    {row.unknownExpectedCount > 0 && (
                      <span className="block text-slate-500">
                        + {row.unknownExpectedCount} unknown
                      </span>
                    )}
                  </td>
                  <td className="p-2 tabular-nums">{formatMoney(row.spendingCents)}</td>
                  <td className="p-2 tabular-nums">{formatMoney(row.cashOutflowCents)}</td>
                  <td className="p-2 tabular-nums">
                    {formatMoney(row.debtBalanceCents)}
                    {row.unknownDebtCount > 0 && (
                      <span className="block text-slate-500">+ {row.unknownDebtCount} unknown</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-4 text-slate-400">No financial records for this selection.</p>
          )}
        </div>
      )}
    </section>
  )
}
