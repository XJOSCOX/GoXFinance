// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PayrollWeek, IncomeSource } from '@goxfinance/shared'
import { IncomeYtd } from './IncomeYtd'
afterEach(cleanup)
it('shows the latest dated YTD component instead of adding consecutive statements', () => {
  const line = {
    label: 'Federal tax',
    code: 'federal',
    side: 'deduction',
    currentCents: 1000,
    ytdCents: -5000,
  }
  const weeks = [
    {
      sourceId: 'job',
      reviewedAt: '2026-10-20',
      statement: { payDate: '2026-10-02', lines: [line] },
    },
    {
      sourceId: 'job',
      reviewedAt: '2026-10-20',
      statement: { payDate: '2026-10-16', lines: [{ ...line, ytdCents: -7000 }] },
    },
  ] as PayrollWeek[]
  render(
    <IncomeYtd
      weeks={weeks}
      sources={[{ id: 'job', name: 'Fictional employer' }] as IncomeSource[]}
      year="2026"
      loading={false}
      error=""
    />,
  )
  expect(screen.getByText('-$70.00')).toBeTruthy()
  expect(screen.queryByText('-$120.00')).toBeNull()
  expect(screen.getAllByText('Federal tax')).toHaveLength(1)
})
