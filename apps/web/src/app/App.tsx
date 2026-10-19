import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/hooks/useAuth'
import { AuthPage } from '../features/auth/pages/AuthPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'

function DashboardRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-shell min-h-screen" role="status">Loading workspace…</div>
  return user ? <DashboardPage /> : <Navigate to="/login" replace />
}

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/signup" element={<AuthPage mode="signup" />} />
    <Route path="/dashboard" element={<DashboardRoute />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></BrowserRouter></AuthProvider>
}
