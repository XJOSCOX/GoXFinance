// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'

const user = { id: 'a84fa699-3ca5-441d-92d7-722a9dcc849b', fullName: 'Alex Example', email: 'alex@example.com' }
const requests: { path: string; method: string }[] = []
let signedIn = false

beforeEach(() => {
  signedIn = false
  requests.length = 0
  window.history.replaceState({}, '', '/dashboard')
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const path = String(url)
    const method = options?.method ?? 'GET'
    requests.push({ path, method })
    if (path.endsWith('/me')) return { ok: signedIn, status: signedIn ? 200 : 401, json: async () => signedIn ? { user } : { error: 'Sign in required' } }
    if (path.endsWith('/signup') || path.endsWith('/login')) { signedIn = true; return { ok: true, status: 200, json: async () => ({ user }) } }
    if (path.endsWith('/logout')) { signedIn = false; return { ok: true, status: 204 } }
    throw new Error(`Unexpected fetch: ${path}`)
  }))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('website authentication', () => {
  it('protects the dashboard using the backend session', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(requests).toContainEqual({ path: '/api/auth/me', method: 'GET' })
  })

  it('signs up, opens the dashboard, and logs out', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Alex Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long unique password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Example' })).toBeTruthy()
    expect(window.location.pathname).toBe('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /Alex Example/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
    expect(requests).toContainEqual({ path: '/api/auth/logout', method: 'POST' })
  })

  it('restores a valid login after browser refresh', async () => {
    signedIn = true
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Example' })).toBeTruthy()
  })

  it('rejects mismatched passwords and uses no browser database or auth storage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem')
    const session = vi.spyOn(Storage.prototype, 'getItem')
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Alex Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Passwords do not match')
    expect(requests.some(request => request.path.endsWith('/signup'))).toBe(false)
    expect(local).not.toHaveBeenCalled()
    expect(session).not.toHaveBeenCalled()
  })
})
