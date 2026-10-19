// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => mocks)
import App from './App'

const user = { id: 'e8d361a6-fbdf-4248-839b-d47bbdd213a8', fullName: 'Alex Example', email: 'alex@example.com' }

beforeEach(() => {
  window.location.hash = '#/'
  mocks.isTauri.mockReturnValue(true)
  mocks.invoke.mockReset()
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'signup' || command === 'login') return { token: 'test-session-token', user }
    if (command === 'current_user') return user
    if (command === 'logout') return null
    throw new Error(`Unexpected command: ${command}`)
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('local authentication screens', () => {
  it('protects the dashboard when there is no session', async () => {
    render(<App/>)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByText('Your GoXPlan workspace is ready.')).toBeNull()
  })
  it('validates signup, opens the empty dashboard, and logs out', async () => {
    render(<App/>)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.change(await screen.findByPlaceholderText('Your name'), { target: { value: 'Alex Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'ALEX@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long unique password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Example' })).toBeTruthy()
    expect(screen.getByText('Your dashboard is empty. New features will appear here as they are built.')).toBeTruthy()
    expect(mocks.invoke).toHaveBeenCalledWith('signup', { fullName: 'Alex Example', email: 'alex@example.com', password: 'long unique password' })
    fireEvent.click(screen.getByRole('button', { name: /Alex Example/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
    expect(mocks.invoke).toHaveBeenCalledWith('logout', { token: 'test-session-token' })
  })
  it('rejects mismatched signup passwords before calling the backend', async () => {
    render(<App/>)
    fireEvent.click(await screen.findByRole('link', { name: 'Sign up' }))
    fireEvent.change(await screen.findByPlaceholderText('Your name'), { target: { value: 'Alex Example' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 12 characters'), { target: { value: 'long unique password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different long password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Passwords do not match')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('returns to login when the backend rejects a session', async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'login') return { token: 'expired-token', user }
      if (command === 'current_user') throw new Error('Session expired')
      throw new Error(`Unexpected command: ${command}`)
    })
    render(<App/>)
    fireEvent.change((await screen.findByPlaceholderText('you@example.com')), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'long unique password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('current_user', { token: 'expired-token' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
  })
  it('uses no browser storage and requires Tauri outside the desktop app', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    mocks.isTauri.mockReturnValue(false)
    render(<App/>)
    expect(screen.getByRole('heading', { name: 'Desktop app required' })).toBeTruthy()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })
})
