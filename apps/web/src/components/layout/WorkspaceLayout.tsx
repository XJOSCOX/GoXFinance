import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/hooks/useAuth'
import { useHousehold } from '../../features/households/hooks/useHousehold'
import { errorMessage } from '../../lib/api'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth()
  const { selected } = useHousehold()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState('')

  async function leave() {
    try { await logout(); navigate('/login', { replace: true }) }
    catch (failure) { setError(errorMessage(failure)) }
  }
  if (!user) return <Navigate to="/login" replace />
  if (!selected) return <Navigate to="/household/setup" replace />

  return <div className="app-shell min-h-screen">
    <WorkspaceSidebar open={sidebarOpen} close={() => setSidebarOpen(false)} household={selected} />
    <div className="min-w-0 md:pl-[216px]">
      <WorkspaceHeader user={user} title={title} openSidebar={() => setSidebarOpen(true)} logout={() => void leave()} />
      <main className="app-main p-4 sm:p-8">
        {error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}
        {children}
      </main>
    </div>
  </div>
}
