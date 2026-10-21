import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { useBudgets } from '../../budgets/hooks/useBudgets'
import { sumCents } from '@goxfinance/shared'
import { BudgetAllocationRing } from '../../budgets/components/BudgetAllocationRing'
import { BudgetPerformanceRows } from '../../budgets/components/BudgetPerformanceRows'
import { ChartPie } from 'lucide-react'
import { OverviewDetails } from './OverviewDetails'
export function OverviewBudgets({ home, month }: { home: string; month: string }) {
  const { data, error } = useBudgets(home, month),
    budget = data?.budget?.status === 'active' ? data.budget : null
  const allocated = budget ? sumCents(budget.limits.map((l) => l.amountCents)) : 0
  const rows = [...(data?.rows ?? [])].sort(
    (a, b) => (b.limitCents ?? 0) - (a.limitCents ?? 0) || a.name.localeCompare(b.name),
  )
  return (
    <Card className="p-4">
      <section aria-label="Monthly budget summary">
        <div className="flex justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ChartPie size={16} className="text-indigo-300" aria-hidden="true" />
            Monthly budget
          </h2>
          <Link
            className="text-xs text-slate-400 hover:underline"
            to={`/households/${home}/budgets`}
          >
            View budget
          </Link>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            Could not load budget: {error}
          </p>
        ) : !data ? (
          <p role="status" className="mt-2 text-xs">
            Loading budget…
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <p>
                Monthly allocation
                <strong className="mt-1 block">
                  {budget ? formatMoney(budget.totalCents) : 'Not set'}
                </strong>
              </p>
              <p>
                Assigned to categories
                <strong className="mt-1 block text-indigo-200">
                  {budget ? formatMoney(allocated) : '—'}
                </strong>
              </p>
              <p>
                Unallocated
                <strong className="mt-1 block text-sky-200">
                  {budget ? formatMoney(budget.totalCents - allocated) : '—'}
                </strong>
              </p>
            </div>
            {budget && (
              <div className="mt-3 border-t border-white/[.07] pt-3">
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <p className="text-slate-400">
                    Actual purchase spending
                    <strong className="ml-2 text-slate-200">{formatMoney(data.actualCents)}</strong>
                  </p>
                  <p className="text-slate-400">
                    {data.overCents ? 'Over monthly allocation' : 'Monthly spending remaining'}
                    <strong
                      className={`ml-2 ${data.overCents ? 'text-rose-300' : 'text-emerald-300'}`}
                    >
                      {formatMoney(data.overCents || data.remainingCents)}
                    </strong>
                  </p>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full ${data.overCents ? 'bg-rose-300' : 'bg-emerald-300'}`}
                    style={{
                      width: `${budget.totalCents > 0 ? Math.min(100, Math.max(0, (data.actualCents / budget.totalCents) * 100)) : data.actualCents > 0 ? 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {!budget && (
              <p className="mt-3 text-xs text-slate-400">
                Actual purchase spending: {formatMoney(data.actualCents)} · No active household
                budget.
              </p>
            )}
            {rows.length > 0 && (
              <div className="mt-3">
                <OverviewDetails label={`Category performance (${rows.length})`}>
                  {budget && (
                    <div className="mb-3 flex justify-center">
                      <BudgetAllocationRing
                        total={budget.totalCents}
                        allocated={allocated}
                        rows={rows}
                      />
                    </div>
                  )}
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Category performance</span>
                    <span>Allocated</span>
                  </div>
                  <BudgetPerformanceRows rows={rows} categories={data.categories} />
                </OverviewDetails>
              </div>
            )}
            <p className="mt-2 border-t border-white/[.06] pt-2 text-[10px] text-slate-500">
              {budget
                ? `${data.rows.filter((r) => r.status === 'Over Budget').length} categories over budget`
                : 'No active household budget'}{' '}
              · {month} · Planned allocation ≠ cash available.
            </p>
          </>
        )}
      </section>
    </Card>
  )
}
