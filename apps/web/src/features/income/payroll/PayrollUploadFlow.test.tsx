// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PayrollUploadFlow } from './PayrollUploadFlow'
const mocks = vi.hoisted(() => ({ api: vi.fn(), notify: vi.fn(), review: vi.fn() }))
vi.mock('../../../lib/api', () => ({
  apiRequest: mocks.api,
  errorMessage: (e: Error) => e.message,
}))
vi.mock('../../../components/ui/useNotify', () => ({ useNotify: () => mocks.notify }))
vi.mock('./payrollClient', () => ({
  payrollBase: (home: string) => home,
  encodePaystub: async (file: File) => ({ data: file.name, mime: file.type }),
}))
vi.mock('./PayrollUploadReview', () => ({
  PayrollUploadReview: (p: {
    saved: (id: string) => void
    close: () => void
    reviewContext: { fileName: string }
    preferredSourceId?: string
    preferredWeekId?: string
  }) => {
    mocks.review(p)
    return (
      <div>
        <p>Reviewing {p.reviewContext.fileName}</p>
        <button
          onClick={() => {
            p.saved('saved-source')
            p.close()
          }}
        >
          Confirm this paycheck
        </button>
        <button onClick={p.close}>Back to queue</button>
      </div>
    )
  },
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const files = [
  new File(['one'], 'one.pdf', { type: 'application/pdf' }),
  new File(['two'], 'two.pdf', { type: 'application/pdf' }),
]
function select() {
  fireEvent.change(screen.getByLabelText('Choose paycheck files'), { target: { files } })
  fireEvent.click(screen.getByRole('button', { name: 'Review 2 paychecks' }))
}
it('extracts sequentially, requires separate review and confirmation, and reports saved files once', async () => {
  mocks.api.mockResolvedValue({ statement: {}, receipt: 'fresh' })
  const saved = vi.fn(),
    close = vi.fn()
  render(
    <PayrollUploadFlow
      home="home"
      preferredSourceId="original"
      preferredWeekId="draft"
      close={close}
      saved={saved}
    />,
  )
  select()
  await screen.findByText('Reviewing one.pdf')
  expect(mocks.api).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
  expect(mocks.review.mock.calls.at(-1)![0].preferredSourceId).toBeUndefined()
  expect(mocks.review.mock.calls.at(-1)![0].preferredWeekId).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm this paycheck' }))
  expect(screen.getByText('1 saved · 1 to review')).toBeTruthy()
  expect(saved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Review & edit' }))
  await screen.findByText('Reviewing two.pdf')
  expect(mocks.api).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm this paycheck' }))
  expect(screen.getByText('2 saved · 0 to review')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
  expect(saved).toHaveBeenCalledExactlyOnceWith('saved-source')
  expect(close).not.toHaveBeenCalled()
})
it('retains an extraction error for retry without saving other files or blocking the batch', async () => {
  mocks.api
    .mockRejectedValueOnce(new Error('Temporary extraction failure'))
    .mockResolvedValue({ statement: {}, receipt: 'retried' })
  const saved = vi.fn()
  render(<PayrollUploadFlow home="home" close={() => {}} saved={saved} />)
  select()
  await screen.findByText('Temporary extraction failure')
  expect(saved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Reviewing one.pdf')
  fireEvent.click(screen.getByRole('button', { name: 'Back to queue' }))
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Review & edit' })).toHaveLength(2),
  )
  expect(saved).not.toHaveBeenCalled()
})
it('keeps employer and draft hints for a single-file upload', async () => {
  mocks.api.mockResolvedValue({ statement: {}, receipt: 'fresh' })
  const saved = vi.fn()
  render(
    <PayrollUploadFlow
      home="home"
      preferredSourceId="job"
      preferredWeekId="draft"
      close={() => {}}
      saved={saved}
    />,
  )
  fireEvent.change(screen.getByLabelText('Choose paycheck files'), {
    target: { files: [files[0]] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Review paycheck' }))
  await screen.findByText('Reviewing one.pdf')
  expect(mocks.review.mock.calls.at(-1)![0]).toMatchObject({
    preferredSourceId: 'job',
    preferredWeekId: 'draft',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm this paycheck' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
  expect(saved).toHaveBeenCalledExactlyOnceWith('saved-source')
})

it('allows skipping an unconfirmed file and refreshes earlier successful saves', async () => {
  mocks.api.mockResolvedValue({ statement: {}, receipt: 'fresh' })
  const saved = vi.fn()
  render(<PayrollUploadFlow home="home" close={() => {}} saved={saved} />)
  select()
  await screen.findByText('Reviewing one.pdf')
  fireEvent.click(screen.getByRole('button', { name: 'Confirm this paycheck' }))
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  expect(screen.getByText('1 saved · 0 to review')).toBeTruthy()
  expect(screen.getByText('Skipped · not saved')).toBeTruthy()
  expect(mocks.api).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
  expect(saved).toHaveBeenCalledExactlyOnceWith('saved-source')
})
it('blocks duplicate extraction and closing while a document is processing', async () => {
  let complete!: (value: unknown) => void
  mocks.api.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const close = vi.fn()
  render(<PayrollUploadFlow home="home" close={close} saved={() => {}} />)
  select()
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1))
  expect(
    screen
      .getAllByRole('button', { name: 'Review & edit' })
      .every((b) => b.hasAttribute('disabled')),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(close).not.toHaveBeenCalled()
  complete({ statement: {}, receipt: 'fresh' })
  await screen.findByText('Reviewing one.pdf')
  expect(mocks.api).toHaveBeenCalledTimes(1)
})
