import { expect, it } from 'vitest'
import type { BillPeriodView } from './bills'
import { billProgress } from './bill-progress'

function period(amountCents: number | null, paidCents = 0, creditCents = 0): BillPeriodView {
  return {
    amountCents,
    paidCents,
    creditCents,
    remainingCents:
      amountCents === null ? null : Math.max(0, amountCents - paidCents - creditCents),
  } as BillPeriodView
}

it('shows partial progress against actual amounts without counting an estimate', () => {
  expect(billProgress([period(34218, 20000), period(null)])).toMatchObject({
    billedCents: 34218,
    paidCents: 20000,
    remainingCents: 14218,
    percent: 58,
    unknownCount: 1,
    settledCount: 0,
  })
})
it('caps overpayments and credits at the billed amount and counts settled periods', () => {
  expect(billProgress([period(10000, 15000), period(10000, 2000, 12000)])).toMatchObject({
    billedCents: 20000,
    paidCents: 12000,
    creditCents: 8000,
    remainingCents: 0,
    percent: 100,
    settledCount: 2,
  })
})
it('does not invent progress for empty, unknown, or zero-value bills', () => {
  expect(billProgress([])).toMatchObject({ percent: null, totalCount: 0 })
  expect(billProgress([period(null)])).toMatchObject({
    percent: null,
    unknownCount: 1,
    settledCount: 0,
  })
  expect(billProgress([period(0)])).toMatchObject({ percent: null, settledCount: 1 })
})
it('never shows complete progress while even one cent remains', () => {
  expect(billProgress([period(10000, 9999)])).toMatchObject({
    percent: 99,
    remainingCents: 1,
    settledCount: 0,
  })
})
