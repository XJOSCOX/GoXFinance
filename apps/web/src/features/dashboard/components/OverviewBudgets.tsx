import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { useBudgets } from '../../budgets/hooks/useBudgets'
export function OverviewBudgets({ home, month }: { home: string; month: string }) {
  const { data, error } = useBudgets(home, month),
    budget = data?.budget?.status === 'active' ? data.budget : null
  return (
    <Card className="p-4">
      <section aria-label="Monthly budget summary">
        <div className="flex justify-between gap-2">
          <h2 className="text-sm font-semibold">Monthly budget</h2>
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
                Planned
                <strong className="mt-1 block">
                  {budget ? formatMoney(budget.totalCents) : 'Not set'}
                </strong>
              </p>
              <p>
                Spent<strong className="mt-1 block">{formatMoney(data.actualCents)}</strong>
              </p>
              <p>
                Remaining<strong className="mt-1 block">{formatMoney(data.remainingCents)}</strong>
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {budget
                ? `${data.rows.filter((r) => r.status === 'Over Budget').length} categories over budget`
                : 'No active household budget'}{' '}
              · {month} · Purchase spending only
            </p>
          </>
        )}
      </section>
    </Card>
  )
}
