import { LayoutDashboard, X } from 'lucide-react'
import { Brand } from '../../../components/layout/Brand'

export function DashboardSidebar({ open, close }: { open: boolean; close: () => void }) {
  return <>
    <aside className={`app-sidebar fixed inset-y-0 left-0 z-30 w-[216px] border-r border-white/10 p-4 transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between">
        <Brand />
        <button className="md:hidden" aria-label="Close navigation" onClick={close}><X size={18}/></button>
      </div>
      <p className="mb-2 mt-10 px-2 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Workspace</p>
      <nav>
        <span aria-current="page" className="flex w-full items-center gap-3 rounded-lg border-l-2 border-[#aab9aa] bg-white/[.07] px-3 py-2 text-sm font-medium text-[#e9ebe7]">
          <LayoutDashboard size={16}/>Overview
        </span>
      </nav>
    </aside>
    {open && <button className="fixed inset-0 z-20 bg-black/60 md:hidden" aria-label="Close navigation overlay" onClick={close}/>}
  </>
}
