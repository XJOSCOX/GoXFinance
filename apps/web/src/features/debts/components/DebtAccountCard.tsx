import { ArrowUpRight, CreditCard } from 'lucide-react'
import { debtTypeLabels, paymentStatusLabels, type Debt, type HouseholdMember } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'

const money = (cents: number | null) => cents == null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function DebtAccountCard({ debt, members, canEdit, canArchive, onView, onEdit, onArchive }: {
  debt: Debt; members: HouseholdMember[]; canEdit: boolean; canArchive: boolean;
  onView: () => void; onEdit: () => void; onArchive: () => void
}) {
  const people = debt.memberAssignments.map(item => members.find(member => member.id === item.memberId)?.fullName ?? 'Member')
  return <Card className="group relative overflow-hidden p-5 transition-colors hover:border-[#a9b8a9]/25 sm:p-6">
    <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#aab9a9]/[.17] bg-[#aab9a9]/[.07] text-[#b2c1b1]"><CreditCard size={20} strokeWidth={1.5}/></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-semibold text-[#eef0eb]">{debt.creditorName}</h3><p className="mt-0.5 truncate text-xs text-slate-400">{debt.accountNickname || debtTypeLabels[debt.accountType]}</p></div><div className="text-left sm:text-right"><p className="text-[10px] uppercase tracking-[.14em] text-slate-500">Current balance</p><p className="mt-1 text-xl font-semibold tracking-tight">{money(debt.currentBalanceCents)}</p></div></div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-md border border-white/[.07] bg-white/[.035] px-2.5 py-1 text-slate-300">{paymentStatusLabels[debt.paymentStatus]}</span><span className="rounded-md border border-[#aab9a9]/[.13] bg-[#aab9a9]/[.06] px-2.5 py-1 capitalize text-[#b9c8b7]">{debt.confidence}</span>{debt.isArchived && <span className="rounded-md border border-white/[.07] px-2.5 py-1 text-slate-400">Archived</span>}</div>
      </div></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.07] pt-4"><p className="min-w-0 truncate text-xs text-slate-400">{people.join(' · ')}</p><div className="flex flex-wrap gap-1"><Button size="small" variant="ghost" className="gap-1" onClick={onView}>View <ArrowUpRight size={13}/></Button>{canEdit && <Button size="small" variant="ghost" onClick={onEdit}>Edit</Button>}{canArchive && <Button size="small" variant="ghost" onClick={onArchive}>{debt.isArchived ? 'Restore' : 'Archive'}</Button>}</div></div>
  </Card>
}
