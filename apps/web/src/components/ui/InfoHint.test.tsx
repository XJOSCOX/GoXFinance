// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InfoHint } from './InfoHint'

afterEach(cleanup)
it('exposes the explanation on hover and keyboard focus and dismisses with Escape', () => {
  render(
    <InfoHint label="Next month details" text="Includes unpaid carry-forward, if still unpaid." />,
  )
  const button = screen.getByRole('button', { name: 'Next month details' })
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.pointerEnter(button, { pointerType: 'mouse' })
  expect(screen.getByRole('tooltip').textContent).toContain('unpaid carry-forward')
  fireEvent.pointerLeave(button)
  fireEvent.focus(button)
  expect(button.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id)
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).toBeNull()
})
it('can pin an explanation by tapping and close it with an outside tap', () => {
  render(<InfoHint label="Estimate details" text="Saved estimate; not an actual bill." />)
  fireEvent.click(screen.getByRole('button', { name: 'Estimate details' }))
  expect(screen.getByRole('tooltip').textContent).toContain('not an actual bill')
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('tooltip')).toBeNull()
})
