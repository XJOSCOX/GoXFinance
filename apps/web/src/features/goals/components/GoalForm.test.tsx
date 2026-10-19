// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GoalForm } from './GoalForm'
afterEach(cleanup)
it('defaults loss budgets and spending limits to staying below the target and tolerates an empty date while editing', () => {
  render(<GoalForm trading={null} members={[]} allowHousehold save={vi.fn()} close={() => {}} />)
  fireEvent.change(screen.getByLabelText('Goal type'), { target: { value: 'spending_limit' } })
  expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe('at_most')
  fireEvent.change(screen.getByLabelText('Goal type'), { target: { value: 'trading_loss' } })
  expect((screen.getByLabelText('Direction') as HTMLSelectElement).value).toBe('at_most')
  fireEvent.change(screen.getByLabelText('First period starts'), { target: { value: '' } })
  expect((screen.getByLabelText('First period ends') as HTMLInputElement).value).toBe('')
})
