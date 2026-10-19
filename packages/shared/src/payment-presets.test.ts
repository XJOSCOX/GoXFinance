import { expect, it } from 'vitest'
import { billPaymentOptions, debtPaymentOptions } from './payment-presets'
it('offers the recorded debt amounts without inferring a payoff or principal allocation', () => {
  const options = debtPaymentOptions({
    currentBalanceCents: 12345,
    minimumPaymentCents: 500,
    pastDueAmountCents: 750,
  })
  expect(options.map((option) => option.amountCents)).toEqual([500, 12345, 750, null])
  expect(options[1].warning).toContain('creditor')
})
it('keeps missing and zero debt amounts distinct and disables their presets', () => {
  const options = debtPaymentOptions({
    currentBalanceCents: null,
    minimumPaymentCents: 0,
    pastDueAmountCents: null,
  })
  expect(options.map((option) => option.disabled)).toEqual([true, true, true, false])
  expect(options[0].amountCents).toBe(0)
  expect(options[1].amountCents).toBeNull()
})
it('offers actual and remaining billed amounts, never a budget estimate', () => {
  expect(
    billPaymentOptions({ amountCents: 34218, remainingCents: 14218 }).map(
      (option) => option.amountCents,
    ),
  ).toEqual([34218, 14218, null])
  expect(
    billPaymentOptions({ amountCents: null, remainingCents: null }).map(
      (option) => option.disabled,
    ),
  ).toEqual([true, true, false])
  expect(
    billPaymentOptions({ amountCents: 0, remainingCents: 0 }).map((option) => option.disabled),
  ).toEqual([true, true, false])
})
