// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { TradingData, Goal } from '@goxfinance/shared'
import { GoalForm } from './GoalForm'
afterEach(cleanup)
it('defaults loss budgets and spending limits to staying below the target and tolerates an empty date while editing', () => {
  render(<GoalForm trading={null} members={[]} allowHousehold save={vi.fn()} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Goal type'), { target: { value: 'spending_limit' } })
  expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe('at_most')
  fireEvent.change(screen.getByLabelText('Goal type'), { target: { value: 'trading_loss' } })
  expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe('at_most')
  fireEvent.change(screen.getByLabelText('First period starts'), { target: { value: '' } })
  expect((screen.getByLabelText('First period ends') as HTMLInputElement).value).toBe('')
})

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
]
const trading = {
  accounts: ids.map((id, i) => ({
    id,
    nickname: `Account ${i + 1}`,
    stage: 'combine',
    canManage: true,
    status: 'active',
  })),
  groups: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Copy team',
      status: 'active',
      members: ids.map((accountId) => ({ accountId })),
    },
  ],
} as TradingData
it('selects all active Combines or a copy group and submits one target per account', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<GoalForm trading={trading} members={[]} allowHousehold save={save} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Select accounts together'), {
    target: { value: 'combine' },
  })
  expect(screen.getByText('3 accounts selected')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  fireEvent.change(screen.getByLabelText('Select accounts together'), {
    target: { value: trading.groups[0].id },
  })
  fireEvent.change(screen.getByLabelText('Goal name'), { target: { value: 'Pass milestone' } })
  fireEvent.change(screen.getByLabelText('Target per account ($)'), { target: { value: '3000' } })
  fireEvent.change(screen.getByLabelText('Goal session starts at'), { target: { value: '17:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save 3 account goals' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values).toMatchObject({
    template: { targetCents: 300000, tradingAccountId: null, copyGroupId: null },
    accounts: ids.map((accountId) => ({ accountId })),
  })
})
it('edits selected goals using each revision and keeps failed inputs', async () => {
  const goals = ids.map((id, i) => ({
    id: `30000000-0000-4000-8000-00000000000${i}`,
    revision: i + 1,
    tradingAccountId: id,
    copyGroupId: null,
    name: `Pass milestone · Account ${i + 1}`,
    goalType: 'trading_profit',
    targetCents: 300000,
    period: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    responsibleMemberId: null,
    timezone: 'America/Chicago',
    sessionStart: '17:00',
    direction: 'at_least',
    status: 'active',
    notes: null,
  })) as Goal[]
  const save = vi.fn().mockRejectedValue(new Error('Refresh before saving'))
  render(
    <GoalForm
      goal={goals[0]}
      batchGoals={goals}
      trading={trading}
      members={[]}
      allowHousehold
      save={save}
      close={() => {}}
    />,
  )
  fireEvent.change(screen.getByLabelText('Target per account ($)'), { target: { value: '3200' } })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Updated personal target' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save 3 account goals' }))
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Refresh before saving'),
  )
  expect(save.mock.calls[0][0].values.accounts).toEqual(
    goals.map((g) => ({ accountId: g.tradingAccountId, goalId: g.id, revision: g.revision })),
  )
  expect((screen.getByLabelText('Target per account ($)') as HTMLInputElement).value).toBe('3200')
})
