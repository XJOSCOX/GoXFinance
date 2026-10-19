// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MoneyField } from './FormField'
afterEach(cleanup)
function Fixture() {
  const [value, setValue] = useState<number | null>(null)
  return (
    <>
      <MoneyField label="Amount" value={value} onChange={setValue} />
      <output>{String(value)}</output>
    </>
  )
}
it('keeps exact cents and invalid input visible instead of rounding excess decimals', () => {
  render(<Fixture />)
  const input = screen.getByLabelText('Amount') as HTMLInputElement
  fireEvent.change(input, { target: { value: '123.456' } })
  expect(input.value).toBe('123.456')
  expect(input.validity.valid).toBe(false)
  expect(screen.getByText('null')).toBeTruthy()
  fireEvent.change(input, { target: { value: '90071992547409.91' } })
  expect(input.validity.valid).toBe(true)
  expect(screen.getByText('9007199254740991')).toBeTruthy()
  fireEvent.change(input, { target: { value: '90071992547409.92' } })
  expect(input.validity.valid).toBe(false)
  expect(input.value).toBe('90071992547409.92')
})
