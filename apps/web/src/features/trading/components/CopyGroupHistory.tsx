import type { TradingData, CopyGroup, CopyEvent } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function CopyGroupHistory({
  data,
  onGroup,
  onEvent,
  onAudit,
}: {
  data: TradingData
  onGroup: (g: CopyGroup) => void
  onEvent: (e: CopyEvent) => void
  onAudit: (id: string) => void
}) {
  const name = (id: string) =>
    data.accounts.find((a) => a.id === id)?.nickname ?? 'Historical account'
  return (
    <div className="space-y-3">
      {!data.groups.length && (
        <Card className="p-8 text-sm text-slate-400">No copy groups yet.</Card>
      )}
      {data.groups.map((group) => (
        <Card key={group.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">{group.name}</h2>
              <p className="mt-1 text-xs text-slate-400">
                Lead: {name(group.leadAccountId)} / {group.status}
              </p>
            </div>
            <div className="flex gap-2">
              {group.canManage && (
                <Button size="small" onClick={() => onGroup(group)}>
                  Edit group
                </Button>
              )}
              <Button size="small" onClick={() => onAudit(group.id)}>
                History
              </Button>
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {group.members.map((m) => (
              <li key={m.accountId} className="rounded-lg border border-white/10 px-3 py-2">
                {name(m.accountId)} / {m.accountId === group.leadAccountId ? 'Lead' : 'Follower'} /{' '}
                {m.quantityMultiplier}x quantity
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {data.events.map((event) => (
        <Card key={event.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {event.membershipSnapshot.name} / {event.mode} / {event.sessionAt.slice(0, 10)}
            </h3>
            <div className="flex gap-2">
              {event.canManage && (
                <Button size="small" onClick={() => onEvent(event)}>
                  Correct event
                </Button>
              )}
              <Button size="small" onClick={() => onAudit(event.id)}>
                History
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Event {event.id} / {event.instrument ?? 'No instrument'} {event.direction ?? ''}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {event.entries.map((e) => (
              <p key={e.accountId} className="rounded-lg bg-white/[.025] p-3 text-xs">
                {name(e.accountId)} / Quantity {e.quantity} / Gross {formatMoney(e.grossCents)} /
                Fees {formatMoney(e.feesCents)} / Net {formatMoney(e.grossCents - e.feesCents)}
              </p>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
