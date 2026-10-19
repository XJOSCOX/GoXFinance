// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { TradingAccounts } from './TradingAccounts'
import { EditRuleForm } from './EditRuleForm'
import { AccountRulesForm } from './AccountRulesForm'

afterEach(cleanup)
const rule = {
  id: '10000000-0000-4000-8000-000000000009',
  label: 'Example',
  effectiveDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z',
  minimumDays: 5,
  minimumWinningDayCents: 15000,
  minimumNetCents: null,
  maximumPayoutCents: 400000,
  profitShareBps: 9000,
  notes: null,
}
const accounts = Array.from(
  { length: 3 },
  (_, i) =>
    ({
      id: `10000000-0000-4000-8000-00000000000${i}`,
      responsibleMemberId: 'member',
      nickname: `Example ${i}`,
      revision: 1,
      stage: 'xfa',
      xfaPath: 'standard',
      status: 'active',
      canManage: true,
      deletedAt: null,
      maximumLossCents: 200000,
      dailyLossCents: 100000,
      timezone: 'America/Chicago',
      sessionStart: '08:30',
      ruleSnapshots: [{ ...rule, id: `10000000-0000-4000-8000-00000000001${i}` }],
    }) as TradingAccount,
)
it('provides a collapsed matching-account group, individual controls, and an Edit all action', () => {
  const editAll = vi.fn(),
    editRule = vi.fn()
  render(
    <TradingAccounts
      accounts={accounts}
      results={[]}
      payouts={[]}
      members={[]}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      onAudit={vi.fn()}
      onEditRule={editRule}
      onEditAll={editAll}
    />,
  )
  expect(screen.getByText(/3 matching accounts/)).toBeTruthy()
  const summary = screen.getByText('View / edit individual accounts (3)')
  expect(summary.closest('details')?.open).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Edit all' }))
  expect(editAll).toHaveBeenCalledWith(accounts)
  fireEvent.click(summary)
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit rule' })[0])
  expect(editRule).toHaveBeenCalledWith(accounts[0], accounts[0].ruleSnapshots[0])
})
it('prefills a saved rule and submits a correction with the account revision', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <EditRuleForm
      account={accounts[0]}
      rule={accounts[0].ruleSnapshots[0]}
      save={save}
      close={() => {}}
    />,
  )
  expect((screen.getByLabelText('Trader profit share (%)') as HTMLInputElement).value).toBe('90')
  fireEvent.change(screen.getByLabelText('Minimum qualifying trading days'), {
    target: { value: '4' },
  })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Correct example rule' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save rule changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toMatchObject({
    revision: 1,
    values: { minimumDays: 4, profitShareBps: 9000 },
  })
})
it('preselects matching accounts for a shared rule correction and retains each original rule link', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<AccountRulesForm accounts={accounts} selectAll save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Reason for update'), {
    target: { value: 'Correct shared rules' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Update 3 accounts' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(
    save.mock.calls[0][0].values.map(
      (v: { ruleSnapshot: { supersedesRuleId: string } }) => v.ruleSnapshot.supersedesRuleId,
    ),
  ).toEqual(accounts.map((a) => a.ruleSnapshots[0].id))
})
