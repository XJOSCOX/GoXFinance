// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { listBudgets } from '../api/budgetClient'
import { useBudgets } from './useBudgets'
import type { BudgetReport } from '@goxfinance/shared'
vi.mock('../api/budgetClient', () => ({ listBudgets: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('refreshes connected budget values on return and removes listeners on unmount', async () => {
  const before = { actualCents: 0 } as BudgetReport,
    after = { actualCents: 20000 } as BudgetReport
  vi.mocked(listBudgets).mockResolvedValueOnce(before).mockResolvedValue(after)
  const { result, unmount } = renderHook(() => useBudgets('fictional-home', '2026-10'))
  await waitFor(() => expect(result.current.data).toBe(before))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  await waitFor(() => expect(result.current.data).toBe(after))
  expect(listBudgets).toHaveBeenCalledTimes(2)
  unmount()
  window.dispatchEvent(new Event('focus'))
  expect(listBudgets).toHaveBeenCalledTimes(2)
})
