import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth'
import { errorMessage } from '../../auth/api/authClient'
import { DashboardHeader } from '../components/DashboardHeader'
import { DashboardSidebar } from '../components/DashboardSidebar'
import { EmptyDashboard } from '../components/EmptyDashboard'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState('')

  async function leave() {
    try { await logout(); navigate('/login', { replace: true }) }
    catch (failure) { setError(errorMessage(failure)) }
  }
  if (!user) return <Navigate to="/login" replace />

  return <div className="app-shell min-h-screen">
    <DashboardSidebar open={sidebarOpen} close={() => setSidebarOpen(false)} />
    <div className="min-w-0 md:pl-[216px]">
      <DashboardHeader user={user} openSidebar={() => setSidebarOpen(true)} logout={() => void leave()} />
      <main className="app-main p-4 sm:p-8">
        <div className="section-heading mb-6">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Private dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user.fullName}</h1>
          <p className="mt-2 text-sm text-slate-400">Your GoXFinance workspace is ready.</p>
        </div>
        <EmptyDashboard />
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      </main>
    </div>
  </div>
}
