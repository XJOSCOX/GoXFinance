import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ChevronDown, LayoutDashboard, LogOut, Menu, Moon, ShieldCheck, X } from 'lucide-react'
import { Brand } from '../components/Brand'
import { Badge, Card } from '../components/ui'
import { useAuth } from '../components/useAuth'
import { errorMessage } from '../lib/auth'

export function DashboardPage() {
  const { session, logout, verify } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void verify().catch(() => navigate('/login', { replace: true })) }, [verify, navigate])

  async function leave() {
    try { await logout(); navigate('/login', { replace: true }) }
    catch (failure) { setError(errorMessage(failure)) }
  }
  if (!session) return <Navigate to="/login" replace/>

  return <div className="app-shell min-h-screen">
    <aside className={`app-sidebar fixed inset-y-0 left-0 z-30 w-[216px] border-r border-white/10 p-4 transition-transform md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between"><Brand/><button className="md:hidden" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div>
      <p className="mb-2 mt-10 px-2 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Workspace</p>
      <nav><button aria-current="page" className="flex w-full items-center gap-3 rounded-lg border-l-2 border-[#aab9aa] bg-white/[.07] px-3 py-2 text-left text-sm font-medium text-[#e9ebe7]"><LayoutDashboard size={16}/>Overview</button></nav>
      <div className="absolute bottom-4 left-3 right-3 rounded-lg border border-white/10 bg-white/[.04] p-3 text-xs text-slate-400"><ShieldCheck size={15} className="mb-2 text-[#aab9aa]"/>Private workspace<br/><span className="mt-1 block text-slate-500">Stored on this device</span></div>
    </aside>
    {sidebarOpen && <button className="fixed inset-0 z-20 bg-black/60 md:hidden" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)}/>}
    <div className="min-w-0 md:pl-[216px]">
      <header className="app-header sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 px-4 sm:px-8">
        <div className="flex items-center gap-4"><button className="md:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">GoXPlan / Overview</span></div>
        <div className="flex items-center gap-3"><Badge>On This Device</Badge><div className="relative"><button className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><span className="max-w-28 truncate">{session.user.fullName}</span><ChevronDown size={14}/></button>{menuOpen && <div className="surface-card absolute right-0 top-11 w-56 rounded-lg border border-white/10 bg-[#1b1d1c] p-2 shadow-xl"><div className="border-b border-white/10 px-2 py-2 text-xs text-slate-400">{session.user.email}</div><button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white/5" onClick={() => void leave()}><LogOut size={15}/>Log out</button></div>}</div></div>
      </header>
      <main className="app-main p-4 sm:p-8">
        <div className="section-heading mb-6"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Private dashboard</p><h1 className="text-3xl font-semibold tracking-tight">Welcome, {session.user.fullName}</h1><p className="mt-2 text-sm text-slate-400">Your GoXPlan workspace is ready.</p></div>
        <Card className="dashboard-hero flex min-h-[310px] flex-col items-center justify-center p-8 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5"><Moon size={25} className="text-[#adbcad]"/></div><h2 className="text-xl font-semibold">A clean place to begin</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-400">Your dashboard is empty. New features will appear here as they are built.</p></Card>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      </main>
    </div>
  </div>
}
