import type { TradingData, TradingPayout } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { StatusBadge } from '../../../components/ui/StatusBadge'
export function PayoutHistory({
  data,
  onPayout,
  onAudit,
}: {
  data: TradingData
  onPayout: (p: TradingPayout) => void
  onAudit: (id: string) => void
}) {
  const name = (id: string) =>
    data.accounts.find((a) => a.id === id)?.nickname ?? 'Historical account'
  return (
    <div className="space-y-3">
      {data.batches.map((batch) => {
        const rows = data.payouts.filter(
          (p) => (p as TradingPayout & { batchId: string | null }).batchId === batch.id,
        )
        return (
          <Card key={batch.id} className="p-4">
            <h2 className="text-sm font-semibold">Batch: {batch.name}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {batch.requestDate} / {rows.length} account requests. Parent batch is not income.
            </p>
            <ul className="mt-3 space-y-2 text-xs">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {name(p.accountId)} / <StatusBadge status={p.status} />
                  </span>
                  <span>
                    Requested {formatMoney(p.requestedCents)} / Received{' '}
                    {formatMoney(p.receivedCents)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
      {!data.payouts.length && (
        <Card className="p-8 text-sm text-slate-400">No external payout activity recorded.</Card>
      )}
      {data.payouts.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {name(p.accountId)} <StatusBadge status={p.status} className="ml-2" />
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Requested {p.requestDate} / Deposit {p.depositDate ?? 'Not received'}
              </p>
            </div>
            <div className="flex items-start gap-2">
              {p.canManage && !['rejected', 'cancelled'].includes(p.status) && (
                <Button size="small" onClick={() => onPayout(p)}>
                  Update
                </Button>
              )}
              <Button size="small" onClick={() => onAudit(p.id)}>
                History
              </Button>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Requested', p.requestedCents],
              ['Approved', p.approvedCents],
              ['Received', p.receivedCents],
              [
                'Request / receipt difference',
                p.receivedCents === null ? null : p.requestedCents - p.receivedCents,
              ],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1">{formatMoney(value as number | null)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            {p.incomeTransactionId
              ? 'Linked to one confirmed Income deposit'
              : 'No confirmed Income deposit'}{' '}
            / {p.reference ?? 'No reference'}
          </p>
        </Card>
      ))}
    </div>
  )
}
