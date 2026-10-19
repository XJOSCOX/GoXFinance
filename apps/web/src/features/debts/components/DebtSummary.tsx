import { AlertCircle, CircleHelp, CreditCard, Wallet } from 'lucide-react'
import type { DebtSummary as Summary } from '@goxfinance/shared'
import { Card } from '../../../components/ui'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtSummary({ summary }: { summary: Summary }) {
  const stats = [
    { label: 'Total debt', value: money(summary.confirmedBalanceCents + summary.estimatedBalanceCents + summary.unverifiedBalanceCents), note: 'Known balances', icon: CreditCard },
    { label: 'Monthly minimums', value: money(summary.totalKnownMinimumCents), note: 'Known amounts only', icon: Wallet },
    { label: 'Past due', value: money(summary.totalPastDueCents), note: 'Reported overdue', icon: AlertCircle },
    { label: 'Unknown balances', value: String(summary.unknownBalanceCount), note: 'Accounts to complete', icon: CircleHelp },
  ]
  return <Card role="region" aria-label="Debt overview" className="grid grid-cols-2 overflow-hidden lg:grid-cols-4">
    {stats.map(({ label, value, note, icon: Icon }, index) => <div key={label} className={'min-w-0 px-4 py-5 sm:px-6 ' + (index > 1 ? 'border-t border-white/[.07] lg:border-t-0 ' : '') + (index % 2 ? 'border-l border-white/[.07] ' : '') + (index === 2 ? 'lg:border-l lg:border-white/[.07]' : '')}>
      <div className="flex items-center gap-2 text-slate-400"><Icon size={14} strokeWidth={1.6} className="shrink-0"/><p className="text-xs">{label}</p></div>
      <p className="mt-3 break-words text-xl font-semibold tabular-nums tracking-tight text-[#edf0ea] sm:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{note}</p>
    </div>)}
  </Card>
}
