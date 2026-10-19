import { useState } from 'react'
import { ChevronDown, LogOut, Menu } from 'lucide-react'
import type { PublicUser } from '@goxfinance/shared'
import { Badge } from '../../../components/ui'

export function DashboardHeader({ user, openSidebar, logout }: { user: PublicUser; openSidebar: () => void; logout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <header className="app-header sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-8">
    <div className="flex items-center gap-4">
      <button className="md:hidden" aria-label="Open navigation" onClick={openSidebar}><Menu size={20}/></button>
      <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">GoXFinance / Overview</span>
    </div>
    <div className="flex items-center gap-3">
      <Badge>Local Workspace</Badge>
      <div className="relative">
        <button className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
          <span className="max-w-28 truncate">{user.fullName}</span><ChevronDown size={14}/>
        </button>
        {menuOpen && <div className="surface-card absolute right-0 top-11 w-56 rounded-lg border border-white/10 bg-[#1b1d1c] p-2 shadow-xl">
          <div className="border-b border-white/10 px-2 py-2 text-xs text-slate-400">{user.email}</div>
          <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white/5" onClick={logout}><LogOut size={15}/>Log out</button>
        </div>}
      </div>
    </div>
  </header>
}
