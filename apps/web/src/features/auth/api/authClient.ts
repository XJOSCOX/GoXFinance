import type { AuthResponse } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'

export const signUp = (fullName: string, email: string, password: string, confirmPassword: string) =>
  apiRequest<AuthResponse>('auth/signup', { method: 'POST', body: JSON.stringify({ fullName, email, password, confirmPassword }) })
export const signIn = (email: string, password: string) =>
  apiRequest<AuthResponse>('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
export const currentUser = () => apiRequest<AuthResponse>('auth/me')
export const signOut = () => apiRequest<void>('auth/logout', { method: 'POST', body: '{}' })

export { errorMessage } from '../../../lib/api'
