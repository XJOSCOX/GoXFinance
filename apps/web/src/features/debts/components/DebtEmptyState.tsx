import { ArrowRight, CreditCard, Link2, Users } from 'lucide-react'
import { Button, Card } from '../../../components/ui'

export function DebtEmptyState({ canAdd, archivedCount, onAdd, onShowArchived }: {
  canAdd: boolean; archivedCount: number; onAdd: () => void; onShowArchived: () => void
}) {
  return <Card className="relative overflow-hidden border-[#a5b5a4]/[.16] bg-[#1b1f1c]">
    <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#a6bba5]/[.08] blur-3xl" />
    <div className="relative grid lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
      <div className="px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <div className="mb-7 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#aab9a9]/25 bg-[#aab9a9]/10 text-[#bdcdbc]"><CreditCard size={23} strokeWidth={1.5} /></div>
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#9daf9d]">Your debt workspace</p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight text-[#f0f2ee] sm:text-4xl">A clearer view starts with one account.</h2>
        <p className="mt-4 max-w-lg text-sm leading-7 text-slate-400">Add a debt when you are ready. Keep balances, account status, and who is responsible together in one place.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">{canAdd && <Button variant="primary" className="gap-2" onClick={onAdd}>Add your first debt <ArrowRight size={16} /></Button>}
          {archivedCount > 0 && <Button onClick={onShowArchived}>View {archivedCount} archived {archivedCount === 1 ? 'account' : 'accounts'}</Button>}</div>
      </div>
      <div className="relative border-t border-white/[.07] bg-white/[.018] px-6 py-9 sm:px-10 lg:flex lg:flex-col lg:justify-center lg:border-l lg:border-t-0 lg:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Keep it organized</p>
        <div className="mt-6 space-y-6">
          <div className="flex gap-4"><span className="mt-0.5 text-[#aab9a9]"><CreditCard size={18} strokeWidth={1.6}/></span><div><p className="text-sm font-medium">Know the account</p><p className="mt-1 text-xs leading-5 text-slate-400">Record what you know. Leave unknown amounts blank.</p></div></div>
          <div className="flex gap-4"><span className="mt-0.5 text-[#aab9a9]"><Users size={18} strokeWidth={1.6}/></span><div><p className="text-sm font-medium">Keep shared debts together</p><p className="mt-1 text-xs leading-5 text-slate-400">Assign people without counting one debt twice.</p></div></div>
          <div className="flex gap-4"><span className="mt-0.5 text-[#aab9a9]"><Link2 size={18} strokeWidth={1.6}/></span><div><p className="text-sm font-medium">Link duplicate records</p><p className="mt-1 text-xs leading-5 text-slate-400">Only verified original and collection links are combined.</p></div></div>
        </div>
      </div>
    </div>
  </Card>
}
