// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PayrollTimeField } from './PayrollTimeField'
afterEach(cleanup)
it('labels separate numeric inputs and restores saved minutes', () => {
  render(
    <PayrollTimeField name="regular" label="Regular" saved={{ hundredths: 3857, minutes: 2314 }} />,
  )
  const hours = screen.getByRole('spinbutton', { name: 'Regular hours' }) as HTMLInputElement,
    minutes = screen.getByRole('spinbutton', { name: 'Regular minutes' }) as HTMLInputElement
  expect(hours.value).toBe('38')
  expect(minutes.value).toBe('34')
  expect(minutes.max).toBe('59')
})
