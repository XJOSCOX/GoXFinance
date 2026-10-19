import { IncomePage } from '../features/income/pages/IncomePage'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/hooks/useAuth'
import { AuthPage } from '../features/auth/pages/AuthPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { HouseholdProvider } from '../features/households/HouseholdProvider'
import { useHousehold } from '../features/households/hooks/useHousehold'
import { HouseholdSetupPage } from '../features/households/pages/HouseholdSetupPage'
import { HouseholdMembersPage } from '../features/households/pages/HouseholdMembersPage'
import { Button, Card } from '../components/ui'
import { NotificationProvider } from '../components/ui/Notifications'
import { JoinHouseholdPage } from '../features/households/pages/JoinHouseholdPage'
import { DebtsPage } from '../features/debts/pages/DebtsPage'
import { BillsPage } from '../features/bills/pages/BillsPage'
import { ExpensesPage } from '../features/expenses/pages/ExpensesPage'

function ProtectedRoute({ setup = false, children }: { setup?: boolean; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { selected, loading: householdLoading, error, refresh } = useHousehold()
  if (authLoading || (user && householdLoading))
    return (
      <div className="app-shell min-h-screen p-6" role="status">
        Loading workspace…
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  if (error)
    return (
      <div className="app-shell grid min-h-screen place-items-center p-4">
        <Card className="w-full max-w-md p-6">
          <h1 className="text-xl font-semibold">Unable to load households</h1>
          <p role="alert" className="mt-2 text-sm text-rose-300">
            {error}
          </p>
          <Button className="mt-5" onClick={() => void refresh()}>
            Try again
          </Button>
        </Card>
      </div>
    )
  if (setup && selected) return <Navigate to="/dashboard" replace />
  if (!setup && !selected) return <Navigate to="/household/setup" replace />
  return children
}

function SignedInRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="app-shell min-h-screen p-6" role="status">
        Loading workspace…
      </div>
    )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <HouseholdProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/signup" element={<AuthPage mode="signup" />} />
              <Route
                path="/household/setup"
                element={
                  <ProtectedRoute setup>
                    <HouseholdSetupPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/household/join"
                element={
                  <SignedInRoute>
                    <JoinHouseholdPage />
                  </SignedInRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/households/:householdId/members"
                element={
                  <ProtectedRoute>
                    <HouseholdMembersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/households/:householdId/debts"
                element={
                  <ProtectedRoute>
                    <DebtsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/households/:householdId/bills"
                element={
                  <ProtectedRoute>
                    <BillsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/households/:householdId/expenses"
                element={
                  <ProtectedRoute>
                    <ExpensesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/households/:householdId/income"
                element={
                  <ProtectedRoute>
                    <IncomePage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </HouseholdProvider>
      </AuthProvider>
    </NotificationProvider>
  )
}
