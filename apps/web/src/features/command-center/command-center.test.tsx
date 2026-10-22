// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  commandCenterSummary,
  commandPreferencesSchema,
  financialInsights,
  smartPlanner,
} from '@goxfinance/shared'
import { insightFixture, insightInput } from '../../../../../packages/shared/src/insights.fixture'
import { DashboardPage } from '../dashboard/pages/DashboardPage'
import { apiRequest } from '../../lib/api'
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), errorMessage: (e: Error) => e.message }))
vi.mock('../households/hooks/useHousehold', () => ({
  useHousehold: () => ({ selected: { id: 'fictional', name: 'Test household' } }),
}))
vi.mock('../../components/layout/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function data() {
  const s = insightFixture(),
    input = insightInput(),
    p = smartPlanner(s, input, '2026-10-20'),
    r = financialInsights(s, input, '2026-10-20T15:00:00Z', '2026-10-20', p)
  return commandCenterSummary(s, p, r, input, {
    home: 'fictional',
    today: '2026-10-20',
    now: '2026-10-20T15:00:00Z',
    month: '2026-10',
    owner: true,
    canManage: true,
    preferences: commandPreferencesSchema.parse({
      quickActions: [
        'upload',
        'estimate',
        'balance',
        'bills',
        'debts',
        'planner',
        'insights',
        'budgets',
      ],
    }),
    preferenceRevision: 0,
  })
}
const mount = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
it('loads one read-only summary, opens existing workflows and supports collapsed details at narrow widths', async () => {
  vi.mocked(apiRequest).mockResolvedValue(data())
  mount()
  expect(await screen.findByRole('heading', { name: 'Financial Command Center' })).toBeTruthy()
  await screen.findByRole('region', { name: 'Financial status' })
  expect(apiRequest).toHaveBeenCalledTimes(1)
  expect(vi.mocked(apiRequest).mock.calls[0][1]).toBeUndefined()
  expect(screen.getByRole('link', { name: 'Upload paycheck' }).getAttribute('href')).toBe(
    '/households/fictional/income?action=upload',
  )
  expect(screen.getByRole('link', { name: 'Report hours / estimate' }).getAttribute('href')).toBe(
    '/households/fictional/income?action=estimate',
  )
  expect(screen.getByRole('link', { name: 'Update available balance' }).getAttribute('href')).toBe(
    '/households/fictional/planner?action=balance',
  )
  expect(
    (screen.getByText('Financial timeline · next 14 days').closest('details') as HTMLDetailsElement)
      .open,
  ).toBe(false)
  expect(screen.getByText(/No future payroll period has been reported/)).toBeTruthy()
  expect(document.querySelector('table')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Command Center' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
  expect(vi.mocked(apiRequest).mock.calls.every((c) => c[1] === undefined)).toBe(true)
})
it('handles request errors and retries without writing financial records', async () => {
  vi.mocked(apiRequest)
    .mockRejectedValueOnce(new Error('Connection unavailable'))
    .mockResolvedValue(data())
  mount()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('region', { name: 'Financial status' })).toBeTruthy()
  expect(apiRequest).toHaveBeenCalledTimes(2)
})
it('persists only display preferences with revision; read-only members do not get cash/payroll mutation shortcuts', async () => {
  const d = data()
  d.owner = false
  d.canManage = false
  d.privacyLimited = true
  vi.mocked(apiRequest).mockResolvedValue(d)
  mount()
  await screen.findByRole('region', { name: 'Financial status' })
  expect(screen.queryByRole('link', { name: 'Upload paycheck' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Update available balance' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Customize Command Center' }))
  fireEvent.change(screen.getByLabelText('Timeline period'), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
  await waitFor(() =>
    expect(vi.mocked(apiRequest).mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true),
  )
  const call = vi.mocked(apiRequest).mock.calls.find((c) => c[1]?.method === 'PUT')!
  expect(call[0]).toBe('households/fictional/command-center/preferences')
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({
    revision: 0,
    values: { periodDays: 30 },
  })
})
