// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActionMenu } from './ActionMenu'
afterEach(cleanup)
it('reveals actions on demand, invokes them once and closes on selection, Escape and outside click', () => {
  const action = vi.fn()
  render(
    <ActionMenu label="Paycheck actions" items={[{ label: 'Edit paycheck', onSelect: action }]} />,
  )
  const summary = screen.getByLabelText('Paycheck actions'),
    details = summary.closest('details')!
  fireEvent.click(summary)
  expect(details.open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Edit paycheck' }))
  expect(action).toHaveBeenCalledTimes(1)
  expect(details.open).toBe(false)
  fireEvent.click(summary)
  fireEvent.keyDown(summary, { key: 'Escape' })
  expect(details.open).toBe(false)
  expect(document.activeElement).toBe(summary)
  fireEvent.click(summary)
  fireEvent.pointerDown(document.body)
  expect(details.open).toBe(false)
})
