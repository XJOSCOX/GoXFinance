// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
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
  expect(screen.getAllByText('Federal income tax')).toHaveLength(1)
})

it('filters YTD by employer and year without adding separate employer records together', () => {
  const weeks = [
    {
      sourceId: 'hire',
      reviewedAt: '2026-10-20',
      statement: {
        payDate: '2026-10-16',
        grossCents: 10000,
        netCents: 8000,
        lines: [
          {
            label: 'Federal income tax',
            code: 'federal',
            side: 'deduction',
            currentCents: 2000,
            ytdCents: 10000,
          },
        ],
      },
    },
    {
      sourceId: 'military',
      reviewedAt: '2026-10-20',
      statement: {
        payDate: '2026-09-25',
        grossCents: 10000,
        netCents: 8000,
        lines: [
          {
            label: 'FED INC TAX',
            code: 'federal',
            side: 'deduction',
            currentCents: 2000,
            ytdCents: 3000,
          },
          {
            label: 'Medicare tax YTD',
            code: 'medicare',
            side: 'informational',
            currentCents: null,
            ytdCents: 500,
          },
        ],
      },
    },
    {
      sourceId: 'military',
      reviewedAt: '2025-10-20',
      statement: {
        payDate: '2025-09-25',
        grossCents: 10000,
        netCents: 8000,
        lines: [
          {
            label: 'FED INC TAX',
            code: 'federal',
            side: 'deduction',
            currentCents: 2000,
            ytdCents: 800000,
          },
        ],
      },
    },
    {
      sourceId: 'unauthorized',
      reviewedAt: '2026-10-20',
      statement: {
        payDate: '2026-10-20',
        grossCents: 10000,
        netCents: 8000,
        lines: [
          {
            label: 'Private source',
            code: 'federal',
            side: 'deduction',
            currentCents: 2000,
            ytdCents: 9999900,
          },
        ],
      },
    },
  ] as PayrollWeek[]
  render(
    <IncomeYtd
      weeks={weeks}
      sources={
        [
          { id: 'hire', name: 'Fictional job' },
          { id: 'military', name: 'Fictional military' },
        ] as IncomeSource[]
      }
      year="2026"
      loading={false}
      error=""
    />,
  )
  const select = screen.getByLabelText('YTD employer') as HTMLSelectElement
  expect(select.value).toBe('hire')
  expect(screen.getByText('$100.00')).toBeTruthy()
  expect(screen.queryByText('$30.00')).toBeNull()
  fireEvent.change(select, { target: { value: 'military' } })
  expect(screen.getByText('$30.00')).toBeTruthy()
  expect(screen.getByText('$5.00')).toBeTruthy()
  expect(screen.queryByText('$100.00')).toBeNull()
  expect(screen.queryByText('$8,000.00')).toBeNull()
  fireEvent.change(select, { target: { value: 'all' } })
  expect(screen.getAllByText('Federal income tax')).toHaveLength(2)
  expect(screen.getByText('$100.00')).toBeTruthy()
  expect(screen.getByText('$30.00')).toBeTruthy()
  expect(screen.queryByText('$130.00')).toBeNull()
  expect(screen.queryByText('$99,999.00')).toBeNull()
})
