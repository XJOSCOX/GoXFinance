// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TradingAccount } from '@goxfinance/shared'
import { CombinePromotionForm } from './CombinePromotionForm'
afterEach(cleanup)
it('requires provider confirmation and leaves funded figures unknown instead of copying evaluation money', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <CombinePromotionForm
      account={
        {
          id: 'combine',
          nickname: 'Example Combine',
          revision: 3,
          reportedBalanceCents: 5300000,
        } as TradingAccount
      }
      save={save}
      close={() => {}}
    />,
  )
  expect(
    (screen.getByLabelText('Actual XFA reported balance ($, optional)') as HTMLInputElement).value,
  ).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Create linked XFA' }))
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByLabelText(
      'Topstep has confirmed this Combine passed and the new XFA is activated.',
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create linked XFA' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0].values).toMatchObject({
    sourceRevision: 3,
    confirmedPassed: true,
    reportedBalanceCents: null,
    ruleSnapshot: null,
    xfaPath: 'standard',
  })
})
