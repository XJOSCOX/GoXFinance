import { AlertCircle, CircleHelp, CreditCard, Wallet } from 'lucide-react'
import type { DebtSummary as Summary, HouseholdMember } from '@goxfinance/shared'
import { Card } from '../../../components/ui'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtSummary({ summary, members }: { summary: Summary; members: HouseholdMember[] }) {
  const knownBalance = summary.confirmedBalanceCents + summary.estimatedBalanceCents + summary.unverifiedBalanceCents
  const stats = [
    { label: 'Household balance', value: money(knownBalance), note: 'Known account balances', icon: CreditCard },
    { label: 'Monthly minimums', value: money(summary.totalKnownMinimumCents), note: 'Known payments only', icon: Wallet },
    { label: 'Past due', value: money(summary.totalPastDueCents), note: 'Known overdue amounts', icon: AlertCircle },
    { label: 'Unknown balances', value: String(summary.unknownBalanceCount), note: 'Need an amount', icon: CircleHelp },
  ]
  return <section aria-label="Debt overview" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, note, icon: Icon }) =>
      <Card key={label} className="relative overflow-hidden p-5 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#a9b9a8]/60 via-[#a9b9a8]/15 to-transparent" />
        <div className="flex items-start justify-between gap-3"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-slate-400">{label}</p>
          <span className="rounded-lg border border-white/[.07] bg-white/[.035] p-2 text-[#aab9a9]"><Icon size={16} strokeWidth={1.6} /></span></div>
        <p className="mt-4 text-2xl font-semibold tracking-tight text-[#edf0ea] sm:text-[27px]">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
      </Card>)}</div>
    <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
      <Card className="p-5 sm:p-6"><div className="flex items-baseline justify-between gap-4"><h2 className="text-sm font-semibold">Balance confidence</h2><span className="text-xs text-slate-500">{summary.countedObligationCount} obligations</span></div>
        <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/[.06]" aria-hidden="true">
          {knownBalance > 0 && <><span className="bg-[#aab9a9]" style={{ width: `${summary.confirmedBalanceCents / knownBalance * 100}%` }} /><span className="bg-[#738477]" style={{ width: `${summary.estimatedBalanceCents / knownBalance * 100}%` }} /><span className="bg-[#4d5b50]" style={{ width: `${summary.unverifiedBalanceCents / knownBalance * 100}%` }} /></>}
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-slate-500">Confirmed</dt><dd className="mt-1 font-medium text-[#dce8dc]">{money(summary.confirmedBalanceCents)}</dd></div><div><dt className="text-slate-500">Estimated</dt><dd className="mt-1 font-medium text-slate-300">{money(summary.estimatedBalanceCents)}</dd></div><div><dt className="text-slate-500">Unverified</dt><dd className="mt-1 font-medium text-slate-300">{money(summary.unverifiedBalanceCents)}</dd></div></dl>
      </Card>
      <Card className="p-5 sm:p-6"><div className="flex items-baseline justify-between gap-4"><h2 className="text-sm font-semibold">People & shared accounts</h2><span className="text-xs text-slate-500">{summary.accountCount} records</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{summary.byMember.map(item => <div key={item.memberId} className="rounded-lg border border-white/[.06] bg-white/[.025] px-3 py-2.5"><p className="truncate text-xs text-slate-400">{members.find(member => member.id === item.memberId)?.fullName ?? 'Member'}</p><p className="mt-1 font-medium">{money(item.knownBalanceCents)}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.sharedCount ? `${item.sharedCount} shared · ` : ''}{item.unknownCount ? `${item.unknownCount} unknown` : 'Known balance'}</p></div>)}</div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Member balances show account associations, not separate amounts owed. Shared accounts count once in the household total.</p>
      </Card>
    </div>
    <p className="px-1 text-xs text-slate-500">Verified original and collection links count once. Unverified links remain separate.</p>
  </section>
}
