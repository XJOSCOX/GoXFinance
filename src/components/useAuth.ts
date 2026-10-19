import { createContext, useContext } from 'react'
import type { AuthSession } from '../lib/auth'

export type AuthContextValue = {
  session: AuthSession | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  verify: () => Promise<void>
}
export const AuthContext = createContext<AuthContextValue | null>(null)
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider missing'); return context }
