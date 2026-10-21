// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PayrollUploadReview } from './PayrollUploadReview'
import { statement } from '../../../../../api/src/modules/payroll/payroll.fixture'
import { apiRequest } from '../../../lib/api'
vi.mock('../../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiRequest: vi.fn(),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const home = crypto.randomUUID(),
  sourceId = crypto.randomUUID()
const preview = {
  statement,
  warnings: [],
  receipt: 'fictional receipt',
  receivedAt: '2026-10-20T18:00:00Z',
  documentDigest: 'fictional digest',
  matchedSourceId: null,
  sources: [],
  newSourceMember: { id: crypto.randomUUID(), name: 'Fictional Member' },
}
it('reconciles the selected draft through the existing upload save action', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ sourceId })
  const draftId = crypto.randomUUID()
  render(
    <PayrollUploadReview
      home={home}
      preview={{
        ...preview,
        sources: [
          {
            id: sourceId,
            name: 'Fictional employer',
            profile: null,
            frequency: 'weekly',
            drafts: [
              {
                id: draftId,
                start: statement.periodStart!,
                end: statement.periodEnd!,
                payDate: statement.payDate,
              },
            ],
          },
        ],
      }}
      preferredSourceId={sourceId}
      preferredWeekId={draftId}
      close={() => {}}
      saved={() => {}}
    />,
  )
  expect((screen.getByLabelText('Saved estimate') as HTMLSelectElement).value).toBe(draftId)
  expect(screen.getByText(/This statement will reconcile the selected draft/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
  const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][1]!.body as string)
  expect(body).toMatchObject({ sourceId, draftWeekId: draftId })
})
it('creates a detected employer with its paycheck without requiring manual rates or a second confirmation', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ sourceId })
  const saved = vi.fn()
  render(<PayrollUploadReview home={home} preview={preview} close={() => {}} saved={saved} />)
  expect((screen.getByLabelText('New employer name') as HTMLInputElement).value).toBe(
    statement.employer,
  )
  expect(screen.queryByLabelText('Regular forecast rate ($)')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith(sourceId))
  const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][1]!.body as string)
  expect(body).toMatchObject({ newSource: { name: statement.employer }, payFrequency: 'weekly' })
  expect(body.sourceId).toBeUndefined()
})
it('uploads under an explicitly selected employer without creating another source', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ sourceId })
  render(
    <PayrollUploadReview
      home={home}
      preview={{
        ...preview,
        sources: [{ id: sourceId, name: 'Fictional employer', profile: null, frequency: 'weekly' }],
      }}
      preferredSourceId={sourceId}
      close={() => {}}
      saved={() => {}}
    />,
  )
  expect(screen.queryByLabelText('New employer name')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
  const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][1]!.body as string)
  expect(body.sourceId).toBe(sourceId)
  expect(body.newSource).toBeUndefined()
})
it('preserves the detected salary basis through paycheck review and saving', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ sourceId })
  render(
    <PayrollUploadReview
      home={home}
      preview={{ ...preview, statement: { ...statement, payBasis: 'salary' } }}
      close={() => {}}
      saved={() => {}}
    />,
  )
  expect((screen.getByLabelText('Pay basis') as HTMLSelectElement).value).toBe('salary')
  fireEvent.click(screen.getByRole('button', { name: 'Save Paycheck' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalled())
  const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][1]!.body as string)
  expect(body.statement.payBasis).toBe('salary')
})
