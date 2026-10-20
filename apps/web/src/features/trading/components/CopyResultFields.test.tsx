// @vitest-environment jsdom
import { expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CopyResultFields } from './CopyResultFields'
import { readCopyAmounts } from '../lib/copy-result-amounts'
afterEach(cleanup)
it('allows an unknown historical copied result to be corrected with fee-adjusted profit/loss', () => {
  const { container } = render(
    <form>
      <CopyResultFields
        accountId="a"
        nickname="Example"
        row={{ accountId: 'a', quantity: '1', grossCents: 10000, feesCents: 0 }}
      />
    </form>,
  )
  expect(screen.getByText(/saved breakdown is unknown/)).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Example enter profit and loss separately'))
  expect((screen.getByLabelText('Example Profit ($)') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Example Profit ($)'), { target: { value: '150' } })
  fireEvent.change(screen.getByLabelText('Example Loss ($)'), { target: { value: '50' } })
  fireEvent.click(screen.getByLabelText('Example P&L already includes trading fees'))
  expect(screen.queryByLabelText('Example Fees ($)')).toBeNull()
  expect(readCopyAmounts(new FormData(container.querySelector('form')!), 'a')).toEqual({
    profitCents: 15000,
    lossCents: 5000,
    grossCents: 10000,
    feesCents: 0,
    feesIncluded: true,
  })
  expect(screen.getByText('Net result: $100.00')).toBeTruthy()
})
