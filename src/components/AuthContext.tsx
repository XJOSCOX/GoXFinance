import { useCallback, useState, type ReactNode } from 'react'
import { currentUser, signIn, signOut, signUp, type AuthSession } from '../lib/auth'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  // The session token exists only in this React process. Reloading or closing the app requires login again.
  const [session, setSession] = useState<AuthSession | null>(null)
  const login = async (email: string, password: string) => { setSession(await signIn(email, password)) }
  const signup = async (name: string, email: string, password: string) => { setSession(await signUp(name, email, password)) }
  const logout = async () => { if (session) await signOut(session.token); setSession(null) }
  const verify = useCallback(async () => { if (!session) throw new Error('Sign in required'); try { await currentUser(session.token) } catch (error) { setSession(null); throw error } }, [session])
  return <AuthContext.Provider value={{ session, login, signup, logout, verify }}>{children}</AuthContext.Provider>
}
