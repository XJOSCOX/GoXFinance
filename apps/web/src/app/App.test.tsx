// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

const user = { id: 'a84fa699-3ca5-441d-92d7-722a9dcc849b', fullName: 'Alex Example', email: 'alex@example.com' }
const householdId = '01bf69dc-66f3-4e91-8323-5c34f4a7576a'
const ownerMember = { id: '9bc9ecf7-a1ad-4239-b444-c8366260a950', householdId, linkedUserId: user.id,
  fullName: user.fullName, relationship: 'self', status: 'active', notes: null, accessRole: 'owner',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const requests: { path: string; method: string }[] = []
let signedIn = false
let household: { id: string; name: string; role: string; moveInDate: string | null; notes: string | null; createdAt: string; updatedAt: string } | null = null
let members: typeof ownerMember[] = []

beforeEach(() => {
  signedIn = false
  household = null
  members = []
  requests.length = 0
  window.history.replaceState({}, '', '/dashboard')
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const path = String(url)
    const method = options?.method ?? 'GET'
    requests.push({ path, method })
    if (path.endsWith('/me')) return { ok: signedIn, status: signedIn ? 200 : 401, json: async () => signedIn ? { user } : { error: 'Sign in required' } }
    if (path.endsWith('/signup') || path.endsWith('/login')) {
      if (path.endsWith('/signup') && JSON.parse(String(options?.body)).invitationCode === 'bad-code') {
        return { ok: false, status: 400, json: async () => ({ code: 'INVITATION_INVALID', error: 'Invitation could not be accepted' }) }
      }
      signedIn = true; return { ok: true, status: 200, json: async () => ({ user }) }
    }
    if (path.endsWith('/logout')) { signedIn = false; return { ok: true, status: 204 } }
    if (path === '/api/households' && method === 'GET') return { ok: true, status: 200, json: async () => ({ households: household ? [household] : [] }) }
    if (path === '/api/households' && method === 'POST') {
      const name = JSON.parse(String(options?.body)).name as string
      household = { id: householdId, name, role: 'owner', moveInDate: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
      members = [ownerMember]
      return { ok: true, status: 201, json: async () => ({ household }) }
    }
    if (path === `/api/households/${householdId}` && method === 'PATCH' && household) {
      household = { ...household, ...JSON.parse(String(options?.body)) }
      return { ok: true, status: 200, json: async () => ({ household }) }
    }
    if (path === `/api/households/${householdId}/members` && method === 'GET') return { ok: true, status: 200, json: async () => ({ members }) }
    if (path === `/api/households/${householdId}/members` && method === 'POST') {
      const input = JSON.parse(String(options?.body))
      const member = { ...ownerMember, ...input, id: '25c0a5d5-8f1e-485d-831b-41040857db79', linkedUserId: null, accessRole: null }
      members = [...members, member]
      return { ok: true, status: 201, json: async () => ({ member }) }
    }
    if (path.endsWith('/25c0a5d5-8f1e-485d-831b-41040857db79') && method === 'DELETE') {
      members = members.map(member => member.id === '25c0a5d5-8f1e-485d-831b-41040857db79' ? { ...member, status: 'inactive' } : member)
      return { ok: true, status: 204 }
    }
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

  it('signs up, sets up a household, opens the dashboard, and logs out', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Alex Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long unique password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Set up your household' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Our household'), { target: { value: 'Our home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Example' })).toBeTruthy()
    expect(window.location.pathname).toBe('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /Alex Example/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
    expect(requests).toContainEqual({ path: '/api/auth/logout', method: 'POST' })
  })

  it('restores a valid login after browser refresh', async () => {
    signedIn = true
    household = { id: householdId, name: 'Our home', role: 'owner', moveInDate: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Example' })).toBeTruthy()
  })

  it('adds and deactivates a household member from the workspace', async () => {
    signedIn = true
    household = { id: householdId, name: 'Our home', role: 'owner', moveInDate: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    members = [ownerMember]
    window.history.replaceState({}, '', `/households/${householdId}/members`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Our home' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Members in Our home' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /People/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Blair Example' } })
    fireEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!)
    expect(await screen.findByRole('heading', { name: 'Blair Example' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(requests.some(request => request.method === 'DELETE')).toBe(true))
  })

  it('offers removal of a linked account inside the house card', async () => {
    signedIn = true
    household = { id: householdId, name: 'Our home', role: 'owner', moveInDate: null, notes: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    members = [ownerMember, { ...ownerMember, id: '25c0a5d5-8f1e-485d-831b-41040857db79',
      fullName: 'Blair Example', linkedUserId: '3bef517c-e6d4-44d5-8828-184bf67e4916', accessRole: 'viewer' }]
    window.history.replaceState({}, '', `/households/${householdId}/members`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Blair Example' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from household' }))
    expect(within(screen.getByRole('dialog')).getByText(/member record will remain inactive/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove access' }))
    await waitFor(() => expect(requests).toContainEqual({ path: `/api/households/${householdId}/members/25c0a5d5-8f1e-485d-831b-41040857db79`, method: 'DELETE' }))
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

  it('keeps invitation signup entries after an invalid-code response', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Join with code' }))
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Blair Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'blair@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByPlaceholderText('Paste your invitation code'), { target: { value: 'bad-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect((await screen.findAllByRole('alert')).some(node => node.textContent?.includes('Invitation could not be accepted'))).toBe(true)
    expect(screen.getByPlaceholderText('Paste your invitation code')).toHaveProperty('value', 'bad-code')
    expect(screen.getByPlaceholderText('Your name')).toHaveProperty('value', 'Blair Example')
    expect(window.location.pathname).toBe('/signup')
  })

  it('shows household details and edits the name and living-since date', async () => {
    signedIn = true
    household = { id: householdId, name: 'Our home', role: 'owner', moveInDate: null, notes: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    members = [ownerMember]
    window.history.replaceState({}, '', `/households/${householdId}/members`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Our home' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(within(screen.getByRole('dialog')).getByText('Not added')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit household' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Household name' }), { target: { value: 'New home' } })
    fireEvent.change(screen.getByLabelText('Living here since'), { target: { value: '2025-06-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('heading', { name: 'New home' })).toBeTruthy()
    expect(requests).toContainEqual({ path: `/api/households/${householdId}`, method: 'PATCH' })
  })
})
