import {
  incomePaycheckStatistics,
  incomeFrequencyLabels,
  type IncomeData,
} from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomePaycheckStats({ data, today }: { data: IncomeData; today: string }) {
  const groups = incomePaycheckStatistics(data.transactions, today)
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Recorded paychecks</h2>
      {!groups.length ? (
        <p className="mt-3 text-sm text-slate-400">No confirmed paychecks yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-white/10">
          {groups.map((g) => (
            <div
              key={g.key}
              className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {data.sources.find((s) => s.id === g.sourceId)?.name ?? 'Income source'}{' '}
                  <span className="font-normal text-slate-400">
                    | {incomeFrequencyLabels[g.frequency] ?? 'Recorded pay'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {g.count} confirmed {g.count === 1 ? 'paycheck' : 'paychecks'} | Latest deposit{' '}
                  {g.latest.depositDate}
                </p>
                {g.count === 1 && (
                  <p className="mt-1 text-xs text-slate-400">
                    Add another confirmed paycheck to calculate an average.
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="block text-xs text-slate-400">
                  {g.averageNetCents === null ? 'Confirmed net pay' : 'Average net per paycheck'}
                </span>
                <strong className="mt-1 block">
                  {formatMoney(g.averageNetCents ?? g.latest.actualNetCents)}
                </strong>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        All recorded dates. Missing uploads are not counted as zero pay. These amounts are not a
        monthly salary estimate.
      </p>
    </Card>
  )
}
