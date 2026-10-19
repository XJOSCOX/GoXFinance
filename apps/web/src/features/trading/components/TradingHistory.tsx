import { CopyGroupHistory } from './CopyGroupHistory'
import { PayoutHistory } from './PayoutHistory'
import type {
  TradingData,
  TradingResult,
  TradingPayout,
  CopyGroup,
  CopyEvent,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { amountTone, toneStyles } from '../../../components/ui/semantic-tones'
export function TradingHistory({
  data,
  tab,
  onResult,
  onPayout,
  onGroup,
  onEvent,
  onAudit,
}: {
  data: TradingData
  tab: string
  onResult: (r: TradingResult) => void
  onPayout: (p: TradingPayout) => void
  onGroup: (g: CopyGroup) => void
  onEvent: (e: CopyEvent) => void
  onAudit: (id: string) => void
}) {
  const name = (id: string) =>
    data.accounts.find((a) => a.id === id)?.nickname ?? 'Historical account'
  if (tab === 'groups')
    return <CopyGroupHistory data={data} onGroup={onGroup} onEvent={onEvent} onAudit={onAudit} />
  if (tab === 'payouts') return <PayoutHistory data={data} onPayout={onPayout} onAudit={onAudit} />

  return (
    <Card className="min-w-0 p-4">
      <h2 className="font-semibold">Daily result history</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2">Account</th>
              <th>Session</th>
              <th>Gross</th>
              <th>Fees</th>
              <th>Net</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...data.results]
              .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
              .map((r) => (
                <tr key={r.id} className="border-t border-white/[.07]">
                  <td className="py-3 pr-3">
                    {name(r.accountId)}
                    {r.copyEventId && (
                      <span className="block text-xs text-slate-500">Copied event</span>
                    )}
                  </td>
                  <td className="pr-3">
                    {r.sessionDate}
                    <span className="block text-xs text-slate-500">{r.timezone}</span>
                  </td>
                  <td>{formatMoney(r.grossCents)}</td>
                  <td>{formatMoney(r.feesCents)}</td>
                  <td className={toneStyles[amountTone(r.netCents)].text}>
                    {formatMoney(r.netCents)}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {r.canManage && (
                        <Button size="small" onClick={() => onResult(r)}>
                          Correct
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => onAudit(r.copyEventId ?? r.id)}
                      >
                        History
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!data.results.length && (
          <p className="py-8 text-center text-sm text-slate-400">No actual results recorded.</p>
        )}
      </div>
    </Card>
  )
}
