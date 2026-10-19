import { ChevronDown } from 'lucide-react'
import type { DebtSummary, HouseholdMember } from '@goxfinance/shared'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtBreakdown({ summary, members }: { summary: DebtSummary; members: HouseholdMember[] }) {
  return <details className="group rounded-xl border border-white/[.08] bg-white/[.015]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm text-slate-300 focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden">
      <span>Balance details & household breakdown</span><ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180"/>
    </summary>
    <div className="grid gap-6 border-t border-white/[.07] p-5 lg:grid-cols-2">
      <section><h2 className="text-sm font-medium">Balance confidence</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">{[
          ['Confirmed', summary.confirmedBalanceCents], ['Estimated', summary.estimatedBalanceCents], ['Unverified', summary.unverifiedBalanceCents],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{money(Number(value))}</dd></div>)}</dl>
        <p className="mt-4 text-xs leading-5 text-slate-500">Verified original and collection links count once. Unverified links remain separate.</p>
      </section>
      <section><h2 className="text-sm font-medium">Member associations</h2><dl className="mt-3 space-y-3">{summary.byMember.map(item => <div key={item.memberId} className="flex flex-wrap justify-between gap-2 text-sm"><dt className="text-slate-400">{members.find(member => member.id === item.memberId)?.fullName ?? 'Member'}{item.sharedCount > 0 && <span className="ml-2 text-xs text-slate-500">{item.sharedCount} shared</span>}{item.unknownCount > 0 && <span className="ml-2 text-xs text-slate-500">{item.unknownCount} unknown</span>}</dt><dd className="font-medium tabular-nums">{money(item.knownBalanceCents)}</dd></div>)}</dl>
        <p className="mt-4 text-xs leading-5 text-slate-500">These are associated balances, not separate amounts owed. Shared debts count once in the household total.</p>
      </section>
    </div>
  </details>
}
