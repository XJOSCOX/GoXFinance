// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReportFilters } from './ReportFilters'
import type { ReportFilters as Filters } from '@goxfinance/shared'
const value: Filters = {
  kind: 'all',
  from: '2026-10-01',
  to: '2026-10-20',
  memberId: null,
  categoryId: null,
  debtId: null,
  accountId: null,
  groupId: null,
}
afterEach(cleanup)
it('sets leap-year month and annual ranges without saving data', () => {
  const change = vi.fn(),
    preview = vi.fn()
  render(
    <ReportFilters
      value={value}
      change={change}
      options={{
        owner: true,
        selfId: null,
        members: [],
        categories: [],
        debts: [],
        accounts: [],
        groups: [],
      }}
      busy={false}
      onPreview={preview}
    />,
  )
  fireEvent.change(screen.getByLabelText('Month shortcut'), { target: { value: '2028-02' } })
  expect(change).toHaveBeenLastCalledWith({ ...value, from: '2028-02-01', to: '2028-02-29' })
  fireEvent.change(screen.getByLabelText('Year shortcut'), { target: { value: '2027' } })
  expect(change).toHaveBeenLastCalledWith({ ...value, from: '2027-01-01', to: '2027-12-31' })
  expect(preview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Preview report' }))
  expect(preview).toHaveBeenCalledOnce()
})
