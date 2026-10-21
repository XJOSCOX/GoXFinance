import type { IncomeTransaction, IncomeSource } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { incomeHistoryDate } from './income-history'
import { formatMoney } from '../../../lib/money'
export function IncomeHistory({
  transactions,
  sources,
  edit,
  details,
}: {
  transactions: IncomeTransaction[]
  sources: IncomeSource[]
  edit: (v: IncomeTransaction) => void
  details: (v: IncomeSource) => void
}) {
  return (
    <div className="space-y-3">
      {transactions.length ? (
        [...transactions]
          .sort(
            (a, b) =>
              incomeHistoryDate(b).localeCompare(incomeHistoryDate(a)) ||
              b.payDate.localeCompare(a.payDate),
          )
          .map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {sources.find((s) => s.id === v.sourceId)?.name ?? 'Income'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Pay date {v.payDate} · {v.status} · Revision {v.revision}
                  </p>
                  {v.depositDate && (
                    <p className="mt-1 text-xs text-slate-400">Deposit date {v.depositDate}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">
                    {v.status === 'confirmed' ? 'Confirmed net' : 'Expected net · not received'}
                  </p>
                  <strong>
                    {formatMoney(v.status === 'confirmed' ? v.actualNetCents : v.expectedNetCents)}
                  </strong>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {v.canManage && (
                  <Button size="small" onClick={() => edit(v)}>
                    {v.status === 'pending' || v.status === 'expected'
                      ? 'Confirm / correct'
                      : 'Correct / cancel'}
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={() => {
                    const source = sources.find((s) => s.id === v.sourceId)
                    if (source) details(source)
                  }}
                >
                  Details & history
                </Button>
              </div>
            </Card>
          ))
      ) : (
        <Card className="p-8 text-sm text-slate-400">No paychecks match this selection.</Card>
      )}
    </div>
  )
}
