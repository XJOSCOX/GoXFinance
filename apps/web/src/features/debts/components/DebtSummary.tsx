import type { DebtSummary as Summary, HouseholdMember } from '@goxfinance/shared'
import { Card } from '../../../components/ui'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtSummary({ summary, members }: { summary: Summary; members: HouseholdMember[] }) {
  const knownBalance = summary.confirmedBalanceCents + summary.estimatedBalanceCents + summary.unverifiedBalanceCents
  const stats = [
    ['Known household balance', money(knownBalance)], ['Known minimums', money(summary.totalKnownMinimumCents)],
    ['Known past due', money(summary.totalPastDueCents)], ['Unknown balances', String(summary.unknownBalanceCount)],
  ]
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([title, value]) => <Card key={title} className="p-4"><p className="text-xs text-slate-400">{title}</p><p className="mt-2 text-xl font-semibold">{value}</p></Card>)}</div>
    <p className="text-xs text-slate-400">{summary.accountCount} active records · {summary.countedObligationCount} counted obligations. Verified duplicate links count once; unverified links remain separate.</p>
    <Card className="grid gap-4 p-4 text-sm sm:grid-cols-2"><div><h2 className="font-medium">Balance confidence</h2><p className="mt-2 text-slate-400">Confirmed: {money(summary.confirmedBalanceCents)}</p><p className="text-slate-400">Estimated: {money(summary.estimatedBalanceCents)}</p><p className="text-slate-400">Unverified: {money(summary.unverifiedBalanceCents)}</p></div>
      <div><h2 className="font-medium">Member associations</h2>{summary.byMember.length ? summary.byMember.map(item => <p key={item.memberId} className="mt-2 text-slate-400">{members.find(member => member.id === item.memberId)?.fullName ?? 'Member'}: {money(item.knownBalanceCents)} associated{item.sharedCount ? ` · ${item.sharedCount} shared` : ''}{item.unknownCount ? ` · ${item.unknownCount} unknown` : ''}</p>) : <p className="mt-2 text-slate-400">No member debt associations yet.</p>}<p className="mt-2 text-xs text-slate-500">Associated balances are not separate amounts owed by each person. Shared debts count once in household totals.</p></div></Card>
  </div>
}
