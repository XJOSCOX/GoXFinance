import { useEffect, useState, type ReactNode } from 'react'
import type { PublicUser } from '@goxfinance/shared'
import { currentUser, signIn, signOut, signUp } from './api/authClient'
import { AuthContext } from './hooks/useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    currentUser().then(result => { if (mounted) setUser(result.user) })
      .catch(() => { if (mounted) setUser(null) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  async function login(email: string, password: string) {
    setUser((await signIn(email, password)).user)
  }
  async function signup(name: string, email: string, password: string, confirmPassword: string) {
    setUser((await signUp(name, email, password, confirmPassword)).user)
  }
  async function logout() {
    await signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
}
