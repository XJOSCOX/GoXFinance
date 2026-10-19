import { useState } from 'react'
import { sumCents, tradingPerformance, type TradingData } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { Select, FormField } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
export function TradingPerformance({ data }: { data: TradingData }) {
  const [selected, setSelected] = useState<string[] | null>(null),
    [group, setGroup] = useState(''),
    [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const ids = selected ?? data.accounts.map((a) => a.id),
    events = new Set(data.events.filter((e) => e.groupId === group).map((e) => e.id)),
    results = group ? data.results.filter((r) => events.has(r.copyEventId ?? '')) : data.results,
    rows = tradingPerformance(results, ids, period)
  return (
    <Card className="min-w-0 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold">Recorded performance</h2>
        <div className="flex flex-wrap gap-3">
          <FormField label="Copy group">
            <Select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All recorded results</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Group by">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
              <option value="day">Daily sessions</option>
              <option value="week">Weekly (Monday start)</option>
              <option value="month">Monthly</option>
            </Select>
          </FormField>
        </div>
      </div>
      <div className="my-4 flex flex-wrap gap-3">
        {data.accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ids.includes(a.id)}
              onChange={(e) =>
                setSelected(e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id))
              }
            />
            {a.nickname}
          </label>
        ))}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Only actual recorded net P&amp;L. Group views use historical copied-event membership.
        Session dates use each account's saved timezone and boundary; nominal balances and payouts
        are excluded.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs text-slate-500">
            <tr>
              <th className="py-2">Period</th>
              <th>Gross</th>
              <th>Fees</th>
              <th>Net realized</th>
              <th>Account sessions / entries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period} className="border-b border-white/[.05]">
                <td className="py-3">{row.period}</td>
                <td>{formatMoney(row.grossCents)}</td>
                <td>{formatMoney(row.feesCents)}</td>
                <td className={row.netCents < 0 ? 'text-rose-300' : 'text-[#b1beb0]'}>
                  {formatMoney(row.netCents)}
                </td>
                <td>{row.sessionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="py-8 text-center text-sm text-slate-400">
            No recorded results for these accounts.
          </p>
        )}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {data.accounts
          .filter((a) => ids.includes(a.id))
          .map((a) => (
            <p
              key={a.id}
              className="flex justify-between gap-3 rounded-lg bg-white/[.02] p-3 text-xs"
            >
              <span>{a.nickname}</span>
              <span>
                {formatMoney(
                  sumCents(tradingPerformance(results, [a.id], period).map(r=>r.netCents)),
                )}
              </span>
            </p>
          ))}
      </div>
    </Card>
  )
}
