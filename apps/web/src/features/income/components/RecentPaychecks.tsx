import type { IncomeSource, IncomeTransaction } from '@goxfinance/shared'
import { ArrowUpRight, Check, Clock3 } from 'lucide-react'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { incomeDisplayDate } from './income-display'
export function RecentPaychecks({
  transactions,
  sources,
  view,
}: {
  transactions: IncomeTransaction[]
  sources: IncomeSource[]
  view?: (t: IncomeTransaction) => void
}) {
  const recent = [...transactions]
    .filter((t) => t.status !== 'cancelled')
    .sort((a, b) => b.payDate.localeCompare(a.payDate))
    .slice(0, 4)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h2 className="text-sm font-semibold">Recent paychecks</h2>
        <span className="text-[11px] text-slate-500">Latest 4 / all dates</span>
      </div>
      {!recent.length ? (
        <p className="p-5 text-sm text-slate-400">Your uploaded paychecks will appear here.</p>
      ) : (
        <ul className="divide-y divide-white/8">
          {recent.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={!view}
                onClick={() => view?.(t)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a9b8a9]"
              >
                <span
                  className={`rounded-full p-2 ${t.status === 'confirmed' ? 'bg-emerald-300/5 text-emerald-300' : 'bg-amber-300/5 text-amber-200'}`}
                >
                  {t.status === 'confirmed' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Clock3 size={14} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {sources.find((s) => s.id === t.sourceId)?.name ?? 'Income source'}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {incomeDisplayDate(t.payDate)} /{' '}
                    {t.status === 'confirmed' ? 'Received' : t.status}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium tabular-nums">
                    {formatMoney(t.actualNetCents ?? t.expectedNetCents)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t.status === 'confirmed' ? 'Net deposit' : 'Not received'}
                  </span>
                </span>
                <ArrowUpRight size={14} className="text-slate-500" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
