// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DebtChangeRequest } from '@goxfinance/shared'
import { NotificationProvider } from '../../../components/ui/Notifications'
import { DebtChangeRequestsPanel } from './DebtChangeRequestsPanel'
import * as client from '../api/changeClient'

vi.mock('../api/changeClient', () => ({ listDebtChanges: vi.fn(), reviewDebtChange: vi.fn() }))
const request: DebtChangeRequest = { id: 'request', householdId: 'home', debtId: 'debt', paymentId: 'payment',
  proposedByUserId: 'admin', proposedByName: 'Test Admin', creditorName: 'Test creditor', action: 'edit_payment',
  reason: 'Correct receipt', proposedChanges: { amountCents: 12000 }, originalValues: { amountCents: 10000 },
  status: 'pending', reviewNote: null, reviewedByUserId: null, reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(client.listDebtChanges).mockResolvedValue({ requests: [request] }) })
afterEach(cleanup)

it('shows original/proposed amounts and only saves after an explicit Owner decision', async () => {
  vi.mocked(client.reviewDebtChange).mockResolvedValue({})
  const changed = vi.fn(async () => {})
  render(<NotificationProvider><DebtChangeRequestsPanel householdId="home" owner onChanged={changed}/></NotificationProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('$100.00')).toBeTruthy(); expect(dialog.getByText('$120.00')).toBeTruthy()
  expect(client.reviewDebtChange).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole('button', { name: 'Approve change' }))
  await waitFor(() => expect(client.reviewDebtChange).toHaveBeenCalledWith('home', 'request', 'approve', null))
  expect(changed).toHaveBeenCalledOnce()
})

it('retains the review and its note when an approval fails', async () => {
  vi.mocked(client.reviewDebtChange).mockRejectedValue(new Error('Payment changed; request is stale'))
  render(<NotificationProvider><DebtChangeRequestsPanel householdId="home" owner onChanged={async () => {}}/></NotificationProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Checked statement' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve change' }))
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('stale'))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Checked statement')
})

it('offers withdrawal without exposing Owner approve/reject actions to the requester', async () => {
  render(<NotificationProvider><DebtChangeRequestsPanel householdId="home" owner={false} onChanged={async () => {}}/></NotificationProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
  expect(screen.queryByRole('button', { name: 'Approve change' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Confirm rejection' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeTruthy()
})
