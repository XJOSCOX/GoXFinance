import { formatMoney as money } from '../../../lib/money'
import { AlertCircle, CircleHelp, CreditCard, Wallet } from 'lucide-react'
import type { DebtSummary as Summary } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { toneStyles, type SemanticTone } from '../../../components/ui/semantic-tones'

export function DebtSummary({ summary }: { summary: Summary }) {
  const stats = [
    {
      label: 'Total debt',
      value: money(
        summary.confirmedBalanceCents +
          summary.estimatedBalanceCents +
          summary.unverifiedBalanceCents,
      ),
      note: 'Known balances',
      icon: CreditCard,
      tone: 'info',
    },
    {
      label: 'Monthly minimums',
      value: money(summary.totalKnownMinimumCents),
      note: 'Known amounts only',
      icon: Wallet,
      tone: 'warning',
    },
    {
      label: 'Past due',
      value: money(summary.totalPastDueCents),
      note: 'Reported overdue',
      icon: AlertCircle,
      tone: summary.totalPastDueCents > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Unknown balances',
      value: String(summary.unknownBalanceCount),
      note: 'Accounts to complete',
      icon: CircleHelp,
      tone: summary.unknownBalanceCount > 0 ? 'warning' : 'neutral',
    },
  ]
  return (
    <Card
      role="region"
      aria-label="Debt overview"
      className="grid grid-cols-2 overflow-hidden lg:grid-cols-4"
    >
      {stats.map(({ label, value, note, icon: Icon, tone }, index) => (
        <div
          key={label}
          className={
            'min-w-0 px-4 py-3 sm:px-4 ' +
            (index > 1 ? 'border-t border-white/[.07] lg:border-t-0 ' : '') +
            (index % 2 ? 'border-l border-white/[.07] ' : '') +
            (index === 2 ? 'lg:border-l lg:border-white/[.07]' : '')
          }
        >
          <div className="flex items-center gap-2 text-slate-400">
            <Icon
              size={14}
              strokeWidth={1.6}
              className={`shrink-0 ${toneStyles[tone as SemanticTone].text}`}
            />
            <p className="text-xs">{label}</p>
          </div>
          <p
            className={`mt-2 break-words text-xl font-semibold tabular-nums tracking-tight ${toneStyles[tone as SemanticTone].text}`}
          >
            {value}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{note}</p>
        </div>
      ))}
    </Card>
  )
}
