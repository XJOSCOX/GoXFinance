import { isTauri } from '@tauri-apps/api/core'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './components/AuthContext'
import { useAuth } from './components/useAuth'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { DesktopRequired } from './pages/DesktopRequired'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  return session ? children : <Navigate to="/login" replace />
}

export default function App() {
  if (!isTauri()) return <DesktopRequired />

  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
