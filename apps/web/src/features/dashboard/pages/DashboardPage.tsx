import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { useAuth } from '../../auth/hooks/useAuth'
import { EmptyDashboard } from '../components/EmptyDashboard'

export function DashboardPage() {
  const { user } = useAuth()
  return <WorkspaceLayout title="Overview">
    <div className="section-heading mb-6">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Dashboard</p>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user?.fullName}</h1>
      <p className="mt-2 text-sm text-slate-400">Your GoXFinance workspace is ready.</p>
    </div>
    <EmptyDashboard />
  </WorkspaceLayout>
}
