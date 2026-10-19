import { incomeSummary, type IncomeData, type HouseholdMember } from '@goxfinance/shared'
import { SummaryStat } from '../../../components/ui/SummaryStat'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomeOverview({
  data,
  members,
  month,
  today,
}: {
  data: IncomeData
  members: HouseholdMember[]
  month: string
  today: string
}) {
  const summary = incomeSummary(data.transactions, month, today)
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryStat
          label="Confirmed income"
          amount={formatMoney(summary.confirmedCents)}
          detail="Actual net deposits in reporting month"
        />
        <SummaryStat
          label="Pending income"
          amount={formatMoney(summary.pendingCents)}
          detail={`Estimated net, not received · ${summary.pendingUnknownCount} unknown`}
        />
        <SummaryStat
          label="Expected future income"
          amount={formatMoney(summary.expectedCents)}
          detail={`Recorded expectations only · ${summary.expectedUnknownCount} unknown`}
        />
      </div>
      <Card className="p-5">
        <h2 className="font-semibold">Confirmed income averages</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <p>
            Weekly <strong className="ml-2">{formatMoney(summary.averageWeeklyCents)}</strong>
            <span className="mt-1 block text-xs text-slate-400">
              {summary.weekCount} calendar weeks
            </span>
          </p>
          <p>
            Monthly <strong className="ml-2">{formatMoney(summary.averageMonthlyCents)}</strong>
            <span className="mt-1 block text-xs text-slate-400">
              {summary.monthCount} calendar months
            </span>
          </p>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          From the first confirmed deposit through today, including weeks and months with no
          recorded deposits. Current periods may be incomplete.
        </p>
      </Card>
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
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { title: 'Weekly net history', items: summary.weekly },
          { title: 'Monthly net history', items: summary.monthly },
        ].map((group) => (
          <Card key={group.title} className="p-5">
            <h2 className="font-semibold">{group.title}</h2>
            <div className="mt-3 max-h-56 overflow-y-auto">
              {group.items.length ? (
                group.items.map((v) => (
                  <p key={v.period} className="flex justify-between gap-3 py-2 text-sm">
                    <span>
                      {v.period}
                      {group.title.startsWith('Weekly') ? ' · week starting' : ''}
                    </span>
                    <span>{formatMoney(v.amountCents)}</span>
                  </p>
                ))
              ) : (
                <p className="text-sm text-slate-400">No confirmed history yet.</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
