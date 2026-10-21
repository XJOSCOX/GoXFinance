import { expect, it } from 'vitest'
import { billPeriodStatus } from './bill-status'

it.each([
  ['2026-10-19', 'Overdue by 1 day', 'negative'],
  ['2026-10-18', 'Overdue by 2 days', 'negative'],
  ['2026-10-20', 'Due today', 'warning'],
  ['2026-10-21', 'Due in 1 day', 'warning'],
  ['2026-10-22', 'Due in 2 days', 'warning'],
  ['2026-10-23', 'Due in 3 days', 'warning'],
  ['2026-10-27', 'Due in 7 days', 'info'],
  ['2026-10-28', 'Upcoming', 'info'],
])('shows calendar timing for %s without changing payment status', (dueDate, label, tone) => {
  const period = { dueDate, paymentStatus: 'unpaid' as const }
  expect(billPeriodStatus(period, '2026-10-20')).toEqual({ label, tone })
  expect(period.paymentStatus).toBe('unpaid')
})

it('keeps partial payments visible with their due timing', () => {
  expect(
    billPeriodStatus({ dueDate: '2026-10-22', paymentStatus: 'partially_paid' }, '2026-10-20'),
  ).toEqual({ label: 'Partially paid · Due in 2 days', tone: 'warning' })
})

it.each(['paid', 'cancelled', 'credited', 'overpaid'] as const)(
  'never labels a %s period overdue',
  (paymentStatus) => {
    const result = billPeriodStatus({ dueDate: '2026-10-01', paymentStatus }, '2026-10-20')
    expect(result.label.toLowerCase()).toBe(paymentStatus)
    expect(result.tone).not.toBe('negative')
  },
)

it('counts dates across month boundaries and daylight-saving transitions', () => {
  expect(
    billPeriodStatus({ dueDate: '2026-11-02', paymentStatus: 'unpaid' }, '2026-10-31').label,
  ).toBe('Due in 2 days')
})
