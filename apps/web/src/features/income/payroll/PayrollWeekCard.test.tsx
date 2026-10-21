// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PayrollProfile, PayrollWeek } from '@goxfinance/shared'
import { profile, hours } from '../../../../../../packages/shared/src/payroll.fixture'
import { PayrollWeekCard } from './PayrollWeekCard'
afterEach(cleanup)
it('shows reviewed actual net ahead of the retained forecast', () => {
  const w = {
      ...hours,
      id: 'week',
      stage: 'paystub_reviewed',
      statement: { netCents: 80000, grossCents: 100000, payDate: '2026-10-16', lines: [] },
      statementReceivedAt: '2026-10-15',
      canManage: false,
      forecasts: [
        {
          modelVersion: 1,
          result: {
            grossCents: 110000,
            netCents: 90000,
            confidence: 'low',
            deductions: [],
            warnings: [],
          },
        },
      ],
    } as unknown as PayrollWeek,
    noop = vi.fn()
  render(
    <PayrollWeekCard
      week={w}
      profile={profile as PayrollProfile}
      edit={noop}
      upload={noop}
      review={noop}
      confirm={noop}
      receive={async () => {}}
      pending={noop}
      busy={false}
    />,
  )
  expect(screen.getByText('Documented net · not deposit confirmation')).toBeTruthy()
  expect(screen.getByText('$800.00', { selector: 'p' })).toBeTruthy()
  expect(screen.queryByText('Estimated net · low confidence')).toBeNull()
})
