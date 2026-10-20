import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localBillDate, tradingCalendar, type TradingData } from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { toneStyles, amountTone } from '../../../components/ui/semantic-tones'
import { formatMoney } from '../../../lib/money'

export function TradingJournalCalendar({ data }: { data: TradingData }) {
  const today = localBillDate()
  const [month, setMonth] = useState(today.slice(0, 7)),
    [account, setAccount] = useState(
      () =>
        data.groups.find(
          (g) => g.status === 'active' && data.accounts.some((a) => a.id === g.leadAccountId),
        )?.leadAccountId ??
        data.accounts[0]?.id ??
        'combine',
    )
  const accounts = data.accounts.filter((a) =>
    account === 'combine'
      ? a.stage === 'combine'
      : account === 'funded'
        ? ['xfa', 'lfa'].includes(a.stage)
        : a.id === account,
  )
  const scopeLabel =
    account === 'combine'
      ? 'all Combine accounts'
      : account === 'funded'
        ? 'all funded accounts'
        : accounts[0]?.nickname
  const calendar = tradingCalendar(
    data.results,
    accounts.map((a) => a.id),
    month,
  )
  const simulated = accounts.some((a) => a.stage === 'combine')
  const move = (offset: number) => {
    const date = new Date(`${month}-01T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + offset)
    setMonth(date.toISOString().slice(0, 7))
  }
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <section aria-label="Daily trading journal" className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold">Daily trading journal</h2>
            <p className="mt-1 text-xs text-slate-400">
              {simulated ? 'Includes simulated Combine P&L. ' : ''}Performance only — not household
              cash or received income.
            </p>
          </div>
          <FormField label="Journal account">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="combine">
                All Combine accounts ({data.accounts.filter((a) => a.stage === 'combine').length})
              </option>
              <option value="funded">
                All funded accounts (
                {data.accounts.filter((a) => ['xfa', 'lfa'].includes(a.stage)).length})
              </option>
              {data.accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.nickname}
                  {a.deletedAt ? ' (hidden)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[.025] p-3">
          <div className="flex items-center gap-2">
            <Button size="small" aria-label="Previous journal month" onClick={() => move(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <Input
              aria-label="Journal month"
              type="month"
              value={month}
              onChange={(e) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value)
              }}
              className="w-40"
            />
            <Button size="small" aria-label="Next journal month" onClick={() => move(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <p className="text-sm">
            Monthly net P&amp;L{' '}
            <strong
              aria-live="polite"
              className={`ml-2 text-xl tabular-nums ${toneStyles[amountTone(calendar.netCents)].text}`}
            >
              {formatMoney(calendar.netCents)}
            </strong>
          </p>
          <Button size="small" onClick={() => setMonth(today.slice(0, 7))}>
            Today
          </Button>
        </div>
        <div
          className="overflow-x-auto rounded-xl border border-white/10"
          tabIndex={0}
          role="region"
          aria-label="Trading calendar, scroll horizontally on small screens"
        >
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <caption className="sr-only">
              {month} daily net results and weekly totals for {scopeLabel}
            </caption>
            <thead className="bg-white/[.025] text-xs text-slate-400">
              <tr>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week total'].map((d) => (
                  <th key={d} scope="col" className="p-3 font-medium">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendar.weeks.map((week, i) => (
                <tr key={week.cells[0].date}>
                  {week.cells.map(({ date, inMonth, result }) => {
                    const tone = result ? amountTone(result.netCents) : 'neutral'
                    const shade = result && result.netCents !== 0 ? toneStyles[tone].badge : ''
                    return (
                      <td
                        key={date}
                        aria-label={`${date}${result ? `, net ${formatMoney(result.netCents)}` : ', no recorded result'}`}
                        className={`h-28 border-t border-r border-white/[.07] p-2 align-top sm:p-3 ${!inMonth ? 'bg-black/15 text-slate-600' : shade}`}
                      >
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${date === today ? 'bg-white/15 font-semibold ring-1 ring-white/40' : 'text-slate-400'}`}
                        >
                          {Number(date.slice(-2))}
                        </span>
                        {result ? (
                          <div className="mt-3">
                            <p className={`font-semibold tabular-nums ${toneStyles[tone].text}`}>
                              {formatMoney(result.netCents)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {result.missingTradeCounts
                                ? `${result.trades} known trades · count incomplete`
                                : `${result.trades} account trades`}
                            </p>
                          </div>
                        ) : inMonth ? (
                          <span className="mt-3 block text-xs text-slate-600">—</span>
                        ) : null}
                      </td>
                    )
                  })}
                  <td className="border-t border-white/[.07] bg-white/[.025] p-3 align-middle">
                    <span className="text-xs text-slate-500">Week {i + 1}</span>
                    <p
                      className={`mt-2 font-semibold tabular-nums ${toneStyles[amountTone(week.netCents)].text}`}
                    >
                      {formatMoney(week.netCents)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{week.entries} entries</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {calendar.recordedDays} recorded days. Blank days have no entry; recorded zero results
          remain visible. Weekly totals include only days in this month. All-account trade counts
          sum account entries, not unique copied executions. Reported trading dates are preserved;
          older timestamp entries keep their session-start dates.
        </p>
      </section>
    </Card>
  )
}
