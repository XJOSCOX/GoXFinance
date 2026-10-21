import { incomeSummary, type IncomeData, type HouseholdMember } from '@goxfinance/shared'
import { useState } from 'react'
import { IncomePaycheckStats } from './IncomePaycheckStats'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomeOverview({
  data,
  members,
  month,
  today,
  changeMonth,
}: {
  data: IncomeData
  members: HouseholdMember[]
  month: string
  today: string
  changeMonth: (month: string) => void
}) {
  const summary = incomeSummary(data.transactions, month, today)
  const [historyView, setHistoryView] = useState<'weekly' | 'monthly'>('weekly')
  const latestMonth = summary.monthly[0]?.period
  const monthLabel = new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const history = historyView === 'weekly' ? summary.weekly : summary.monthly
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">
        Totals for {monthLabel}. The reporting month groups deposits; it does not change your pay
        frequency.
      </p>
      {summary.confirmedCents === 0 &&
        !summary.bySource.length &&
        latestMonth &&
        latestMonth !== month && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm">
            <p>
              No confirmed deposits in {monthLabel}. Your latest recorded deposit is in{' '}
              {latestMonth}.
            </p>
            <Button size="small" onClick={() => changeMonth(latestMonth)}>
              View latest pay month
            </Button>
          </div>
        )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryStat
          label="Confirmed income"
          tone="positive"
          amount={formatMoney(summary.confirmedCents)}
          detail="Actual net deposits in reporting month"
        />
        <SummaryStat
          label="Pending income"
          tone="warning"
          amount={formatMoney(summary.pendingCents)}
          detail={`Estimated net, not received · ${summary.pendingUnknownCount} unknown`}
        />
        <SummaryStat
          label="Expected future income"
          tone="info"
          amount={formatMoney(summary.expectedCents)}
          detail={`Recorded expectations only · ${summary.expectedUnknownCount} unknown`}
        />
      </div>
      <IncomePaycheckStats data={data} today={today} />
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          {
            title: 'By earning member',
            items: summary.byMember,
            label: (id: string) => members.find((v) => v.id === id)?.fullName ?? 'Member',
          },
          {
            title: 'By source',
            items: summary.bySource,
            label: (id: string) => data.sources.find((v) => v.id === id)?.name ?? 'Source',
          },
        ].map((group) => (
          <Card key={group.title} className="p-5">
            <h2 className="font-semibold">{group.title}</h2>
            {group.items.length ? (
              group.items.map((v) => (
                <p key={v.id} className="mt-3 flex justify-between gap-3 text-sm">
                  <span>{group.label(v.id)}</span>
                  <strong>{formatMoney(v.amountCents)}</strong>
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-slate-400">No confirmed deposits this month.</p>
            )}
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Deposit history</h2>
          <div className="flex gap-2" role="group" aria-label="Deposit history grouping">
            <Button
              size="small"
              aria-pressed={historyView === 'weekly'}
              onClick={() => setHistoryView('weekly')}
            >
              Weekly totals
            </Button>
            <Button
              size="small"
              aria-pressed={historyView === 'monthly'}
              onClick={() => setHistoryView('monthly')}
            >
              Monthly totals
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {historyView === 'weekly'
            ? 'Recorded deposits grouped by calendar week.'
            : 'Recorded deposits grouped by calendar month, not your pay schedule.'}
        </p>
        <div className="mt-3 max-h-56 overflow-y-auto">
          {history.length ? (
            history.map((v) => (
              <p key={v.period} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  {v.period}
                  {historyView === 'weekly' ? ' | week starting' : ''}
                </span>
                <span>{formatMoney(v.amountCents)}</span>
              </p>
            ))
          ) : (
            <p className="text-sm text-slate-400">No confirmed history yet.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
