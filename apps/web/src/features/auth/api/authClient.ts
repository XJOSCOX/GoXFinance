import type { AuthResponse } from '@goxfinance/shared'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json', 'X-GoXFinance-Request': '1' } : undefined,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Unable to complete the request')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const signUp = (fullName: string, email: string, password: string, confirmPassword: string) =>
  request<AuthResponse>('signup', { method: 'POST', body: JSON.stringify({ fullName, email, password, confirmPassword }) })
export const signIn = (email: string, password: string) =>
  request<AuthResponse>('login', { method: 'POST', body: JSON.stringify({ email, password }) })
export const currentUser = () => request<AuthResponse>('me')
export const signOut = () => request<void>('logout', { method: 'POST', body: '{}' })

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Unable to complete the request' }
