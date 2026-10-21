// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { IncomeTransaction, IncomeSource } from '@goxfinance/shared'
import { IncomeHistory } from './IncomeHistory'
afterEach(cleanup)
it('offers read-only details without exposing correction actions to a read-only member', () => {
  const t = {
    id: 'one',
    sourceId: 'job',
    payDate: '2026-10-16',
    depositDate: '2026-10-16',
    status: 'confirmed',
    actualNetCents: 80000,
    actualGrossCents: 100000,
    deductionsCents: 20000,
    canManage: false,
  } as IncomeTransaction
  const view = vi.fn(),
    edit = vi.fn()
  render(
    <IncomeHistory
      transactions={[t]}
      sources={[{ id: 'job', name: 'Fictional employer' }] as IncomeSource[]}
      view={view}
      edit={edit}
      details={() => {}}
    />,
  )
  fireEvent.click(screen.getByLabelText('Actions for paycheck 2026-10-16'))
  expect(screen.queryByRole('button', { name: 'Correct / cancel' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View paycheck' }))
  expect(view).toHaveBeenCalledWith(t)
  expect(edit).not.toHaveBeenCalled()
})
it('labels pending documented net separately from received cash', () => {
  const t = {
    id: 'one',
    sourceId: 'job',
    payDate: '2026-10-16',
    depositDate: null,
    status: 'pending',
    actualNetCents: 80000,
    actualGrossCents: 100000,
    deductionsCents: 20000,
    canManage: true,
  } as IncomeTransaction
  render(
    <IncomeHistory
      transactions={[t]}
      sources={[]}
      view={() => {}}
      edit={() => {}}
      details={() => {}}
    />,
  )
  expect(screen.getByText('Documented net')).toBeTruthy()
  expect(screen.queryByText('Net received')).toBeNull()
})
