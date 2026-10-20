// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { TradingAccount, HouseholdMember } from '@goxfinance/shared'
import { AccountForm } from './AccountForm'

afterEach(cleanup)
const member = {
  id: '10000000-0000-4000-8000-000000000001',
  fullName: 'Test member',
} as HouseholdMember
const template = {
  id: '10000000-0000-4000-8000-000000000002',
  revision: 7,
  responsibleMemberId: member.id,
  provider: 'Topstep',
  nickname: 'Lead account',
  maskedExternalId: '1234',
  stage: 'xfa',
  xfaPath: 'standard',
  tierCents: 5000000,
  reportedBalanceCents: 98765,
  maximumLossCents: 200000,
  dailyLossCents: 25000,
  activationDate: '2026-10-01',
  status: 'closed',
  timezone: 'America/Chicago',
  sessionStart: '18:00',
  notes: 'Original private notes',
  ruleSnapshots: [],
} as unknown as TradingAccount

it('duplicates setup with fresh identity and unknown balances, without editing the original', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<AccountForm template={template} members={[member]} save={save} close={() => {}} />)
  expect((screen.getByLabelText('Reported trading balance ($)') as HTMLInputElement).value).toBe('')
  expect(
    (screen.getByLabelText('Account 1 identifier (last four, optional)') as HTMLInputElement).value,
  ).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  const [body, batch] = save.mock.calls[0]
  expect(batch).toBe(false)
  expect(body.revision).toBeUndefined()
  expect(body.values).toMatchObject({
    nickname: 'Lead account copy',
    tierCents: 5000000,
    reportedBalanceCents: null,
    activationDate: null,
    maskedExternalId: null,
    status: 'active',
    notes: null,
    ruleSnapshot: null,
  })
  expect(template.reportedBalanceCents).toBe(98765)
})

it('creates a batch with separate names and identifiers and preserves inputs after failure', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Save unavailable'))
  render(<AccountForm template={template} members={[member]} save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Number of accounts'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Activation date'), { target: { value: '2026-10-09' } })
  fireEvent.change(screen.getByLabelText('Account 2 nickname'), {
    target: { value: 'Second account' },
  })
  fireEvent.change(screen.getByLabelText('Account 2 identifier (last four, optional)'), {
    target: { value: '4321' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create 4 accounts' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Save unavailable'))
  const [body, batch] = save.mock.calls[0]
  expect(batch).toBe(true)
  expect(body.values).toHaveLength(4)
  expect(body.values[1]).toMatchObject({
    nickname: 'Second account',
    maskedExternalId: '4321',
    reportedBalanceCents: null,
    activationDate: '2026-10-09',
  })
  expect((screen.getByLabelText('Account 2 nickname') as HTMLInputElement).value).toBe(
    'Second account',
  )
  fireEvent.change(screen.getByLabelText('Number of accounts'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Number of accounts'), { target: { value: '4' } })
  expect((screen.getByLabelText('Account 2 nickname') as HTMLInputElement).value).toBe(
    'Second account',
  )
})
