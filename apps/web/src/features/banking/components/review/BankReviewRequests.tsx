import type { BankInbox } from '@goxfinance/shared'
import { Card, Button } from '../../../../components/ui'
export function BankReviewRequests({
  data,
  open,
}: {
  data: BankInbox
  open: (request: BankInbox['requests'][number]) => void
}) {
  const pending = data.requests.filter((r) => r.status === 'pending')
  if (!data.requests.length) return null
  return (
    <Card className="mb-4 p-4">
      {pending.length > 0 && (
        <h2 className="mb-3 text-sm font-semibold">
          {data.owner ? 'Pending Owner approvals' : 'Your pending requests'} · {pending.length}
        </h2>
      )}
      <div className="space-y-2">
        {pending.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
          >
            <div>
              <p className="text-sm">
                {data.transactions.find((t) => t.id === r.transactionId)?.description ??
                  'Bank transaction'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {r.proposedByName ?? 'Household member'} · {new Date(r.createdAt).toLocaleString()}
              </p>
            </div>
            <Button size="small" onClick={() => open(r)}>
              {data.owner ? 'Review proposal' : 'View request'}
            </Button>
          </div>
        ))}
      </div>
      {data.requests.some((r) => r.status !== 'pending') && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Review history</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.requests
              .filter((r) => r.status !== 'pending')
              .slice(-15)
              .reverse()
              .map((r) => (
                <Button key={r.id} size="small" onClick={() => open(r)}>
                  {r.status} · {new Date(r.createdAt).toLocaleDateString()}
                </Button>
              ))}
          </div>
        </details>
      )}
    </Card>
  )
}
