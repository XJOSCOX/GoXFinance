import { CalendarClock } from 'lucide-react'
import type { IncomeSource, IncomeTransaction, PayrollWeek } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { incomeDisplayDate, incomeDisplayPeriod } from './income-display'
import {
  estimatedWorkedTime,
  nextPaycheckEstimate,
  latestPaycheckForecast,
} from './next-paycheck-estimate'
export function NextPaycheckEstimate({
  weeks,
  sources,
  transactions,
  today,
  loading,
  error,
  upload,
}: {
  weeks: PayrollWeek[]
  sources: IncomeSource[]
  transactions: IncomeTransaction[]
  today: string
  loading: boolean
  error: string
  upload?: (week: PayrollWeek) => void
}) {
  const week = nextPaycheckEstimate(weeks, sources, transactions, today),
    forecast = week ? latestPaycheckForecast(week) : undefined
  return (
    <Card className="border-sky-300/15 bg-sky-300/[0.025] p-5">
      <div className="flex items-center gap-2 text-sky-200">
        <CalendarClock size={17} aria-hidden="true" />
        <h2 className="text-sm font-semibold">Next estimated paycheck</h2>
      </div>
      {loading ? (
        <p role="status" className="mt-3 text-xs text-slate-400">
          Loading saved forecasts...
        </p>
      ) : error ? (
        <p role="alert" className="mt-3 text-xs text-amber-200">
          Forecast unavailable. {error}
        </p>
      ) : !week || !forecast ? (
        <p className="mt-3 text-sm text-slate-400">
          No upcoming forecast saved. Use Income actions to estimate your next paycheck.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {sources.find((s) => s.id === week.sourceId)?.name ?? 'Employer'}
            </p>
            <span className="rounded-full bg-sky-300/5 px-2 py-1 text-[11px] text-sky-200">
              {week.stage === 'hours_draft' ? 'Draft forecast' : 'Not received'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Work period {incomeDisplayPeriod(week.workweekStart, week.workweekEnd)}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Expected pay date</dt>
              <dd className="mt-1 font-medium">{incomeDisplayDate(week.expectedPayDate!)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Hours worked</dt>
              <dd className="mt-1 font-medium tabular-nums">{estimatedWorkedTime(week)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Expected gross</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {formatMoney(forecast.grossCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Estimated take-home</dt>
              <dd className="mt-1 text-lg font-semibold text-sky-200 tabular-nums">
                {formatMoney(forecast.netCents)}
              </dd>
            </div>
          </dl>
          {week.canManage && upload && (
            <Button className="mt-4" size="small" onClick={() => upload(week)}>
              Upload paycheck
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
