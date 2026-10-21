// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { IncomeTransaction, PayrollData, PayrollWeek } from '@goxfinance/shared'
import { useIncomePayroll } from './useIncomePayroll'
import { loadPayroll } from '../payroll/payrollClient'
vi.mock('../payroll/payrollClient', () => ({ loadPayroll: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
it('discards stale responses after the household changes and reports load failures', async () => {
  let resolveOld!: (v: PayrollData) => void
  vi.mocked(loadPayroll)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    .mockRejectedValueOnce(new Error('Request unavailable'))
  const transactions: IncomeTransaction[] = []
  const { result, rerender } = renderHook(({ home }) => useIncomePayroll(home, transactions), {
    initialProps: { home: 'old household' },
  })
  rerender({ home: 'new household' })
  await act(async () => {
    resolveOld({
      weeks: [{ id: 'private old week' } as PayrollWeek],
      profiles: [],
      canManage: false,
    })
  })
  await waitFor(() => expect(result.current.error).toBe('Request unavailable'))
  expect(result.current.weeks).toEqual([])
})
