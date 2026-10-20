import { useRef, useState } from 'react'
import {
  bankProposalSchema,
  type BankClassification,
  type BankInbox,
  type BankReviewOptions,
  type BankProposal,
} from '@goxfinance/shared'
import { Modal } from '../../../../components/ui/Modal'
import { Button } from '../../../../components/ui'
import { FormField, Select } from '../../../../components/ui/FormField'
import { apiRequest, errorMessage } from '../../../../lib/api'
import { useNotify } from '../../../../components/ui/useNotify'
import { formatMoney } from '../../../../lib/money'
import { useBanking } from '../../hooks/useBanking'
import { ExpenseReviewFields } from './ExpenseReviewFields'
import { BillReviewFields, DebtReviewFields } from './PaymentReviewFields'
import {
  IncomeReviewFields,
  TransferReviewFields,
  RefundReviewFields,
  IgnoreReviewFields,
} from './OtherReviewFields'
import { buildBankProposal } from './build-proposal'
import { ReviewSummary } from './ReviewSummary'
import { bankClassLabels } from './review-labels'
type Request = BankInbox['requests'][number]
export function BankReviewDialog({
  home,
  id,
  request,
  close,
  saved,
}: {
  home: string
  id: string
  request?: Request
  close: () => void
  saved: () => void
}) {
  const { data, error } = useBanking<BankReviewOptions>(home, `/transactions/${id}/review`)
  return data ? (
    <ReviewEditor
      key={data.transaction.id + data.transaction.revision}
      home={home}
      data={data}
      request={request}
      close={close}
      saved={saved}
    />
  ) : (
    <Modal title="Review transaction" onClose={close}>
      <p role={error ? 'alert' : 'status'}>{error || 'Loading financial matches…'}</p>
    </Modal>
  )
}
function ReviewEditor({
  home,
  data,
  request,
  close,
  saved,
}: {
  home: string
  data: BankReviewOptions
  request?: Request
  close: () => void
  saved: () => void
}) {
  const [kind, setKind] = useState<BankClassification>(
      data.existingLink?.classification ??
        (data.transaction.amountCents > 0 ? 'income' : 'expense'),
    ),
    [preview, setPreview] = useState<{
      fingerprint: string
      proposal: BankProposal
      newRecordConfirmed: boolean
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmReject, setConfirmReject] = useState(false),
    [confirmCancel, setConfirmCancel] = useState(false),
    pending = useRef(false),
    key = useRef(crypto.randomUUID()),
    notify = useNotify(),
    parsed = request ? bankProposalSchema.safeParse(request.proposal) : null,
    proposal = parsed?.success ? parsed.data : undefined
  const post = <T,>(path: string, body: unknown) =>
    apiRequest<T>(`households/${home}/banking${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  async function run(work: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function finish(message: string) {
    notify('success', message)
    saved()
    close()
  }
  return (
    <Modal
      title={request ? 'Owner review' : 'Review transaction'}
      onClose={() => {
        if (!pending.current) close()
      }}
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-col"
        onChange={() => setPreview(undefined)}
        onSubmit={(event) => {
          event.preventDefault()
          if (request) return
          const form = new FormData(event.currentTarget)
          void run(async () => {
            const p = buildBankProposal(kind, data, form),
              newRecordConfirmed = form.has('newRecordConfirmed'),
              result = await post<{ fingerprint: string }>(
                `/transactions/${data.transaction.id}/preview`,
                { revision: data.transaction.revision, proposal: p, newRecordConfirmed },
              )
            setPreview({ fingerprint: result.fingerprint, proposal: p, newRecordConfirmed })
          })
        }}
      >
        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-white/5 p-4">
            <div>
              <h3 className="font-semibold">
                {data.transaction.merchant ?? data.transaction.description}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {data.account.name} · {data.transaction.date} ·{' '}
                {data.transaction.pending ? 'Pending' : 'Posted'}
              </p>
            </div>
            <strong className="text-xl">{formatMoney(data.transaction.amountCents)}</strong>
          </div>
          {request && (
            <p className="text-sm text-slate-400">
              Proposed by {request.proposedByName ?? 'Household member'} ·{' '}
              {new Date(request.createdAt).toLocaleString()} · {request.status}
            </p>
          )}
          {data.transaction.pending && (
            <p className="text-sm text-amber-200">
              Pending authorizations cannot become completed payments or confirmed income. Wait for
              the posted transaction, or explicitly exclude the authorization.
            </p>
          )}
          {request ? (
            proposal ? (
              <ReviewSummary proposal={proposal} data={data} />
            ) : (
              <p role="alert">
                This request cannot be displayed. Reject it and ask for a fresh proposal.
              </p>
            )
          ) : (
            <fieldset disabled={busy || !data.canReview} className="space-y-5">
              {data.matches.length > 0 && (
                <details className="rounded-lg border border-amber-300/15 p-3">
                  <summary className="cursor-pointer text-sm text-amber-200">
                    {data.matches.length} possible existing records — check before creating another
                  </summary>
                  <ul className="mt-2 space-y-2 text-xs text-slate-400">
                    {data.matches.map((m) => (
                      <li key={m.classification + m.id}>
                        {bankClassLabels[m.classification]} · {m.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <FormField label="Classification">
                <Select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as BankClassification)}
                >
                  {Object.entries(bankClassLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div key={kind} className="space-y-4">
                {(kind === 'expense' || kind === 'fee') && <ExpenseReviewFields data={data} />}{' '}
                {kind === 'bill_payment' && <BillReviewFields data={data} />}{' '}
                {kind === 'debt_payment' && <DebtReviewFields data={data} />}{' '}
                {kind === 'income' && <IncomeReviewFields data={data} />}{' '}
                {kind === 'transfer' && <TransferReviewFields data={data} />}{' '}
                {kind === 'refund' && <RefundReviewFields data={data} />}{' '}
                {kind === 'ignore' && <IgnoreReviewFields />}
              </div>
              {data.matches.length > 0 && (
                <label className="flex items-start gap-2 text-xs text-slate-400">
                  <input type="checkbox" name="newRecordConfirmed" />
                  If creating a new record, I checked the matches and confirm this is a separate
                  transaction.
                </label>
              )}
              {!data.owner && (
                <p className="text-sm text-amber-200">
                  The Owner must approve this request before it affects financial totals.
                </p>
              )}
            </fieldset>
          )}
          {preview && <ReviewSummary proposal={preview.proposal} data={data} />}
          {confirmReject && (
            <p className="text-sm text-amber-200">
              Reject this proposal? Its audit history will be retained and no financial entry will
              be created.
            </p>
          )}
          {confirmCancel && (
            <p className="text-sm text-amber-200">
              Cancel the refund adjustment? The bank transaction will need review again; the
              original record remains.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 p-4">
          <Button type="button" disabled={busy} onClick={close}>
            Close
          </Button>
          {request && !data.owner && data.canReview && request.status === 'pending' && (
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post(`/requests/${request.id}/decision`, { decision: 'cancel' })
                  finish('Request cancelled')
                })
              }
            >
              Cancel request
            </Button>
          )}
          {!request && data.owner && data.refund?.status === 'completed' && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirmCancel) {
                  setConfirmCancel(true)
                  return
                }
                void run(async () => {
                  await post(`/refunds/${data.refund!.id}/cancel`, {
                    revision: data.transaction.revision,
                  })
                  finish('Refund adjustment cancelled')
                })
              }}
            >
              {confirmCancel ? 'Confirm cancellation' : 'Cancel refund adjustment'}
            </Button>
          )}
          {request && data.owner && request.status === 'pending' ? (
            <>
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirmReject) {
                    setConfirmReject(true)
                    return
                  }
                  void run(async () => {
                    await post(`/requests/${request.id}/decision`, { decision: 'reject' })
                    finish('Request rejected')
                  })
                }}
              >
                {confirmReject ? 'Confirm rejection' : 'Reject'}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy || !proposal}
                onClick={() =>
                  void run(async () => {
                    await post(`/requests/${request.id}/decision`, { decision: 'approve' })
                    finish('Request approved and saved')
                  })
                }
              >
                {busy ? 'Saving…' : 'Approve request'}
              </Button>
            </>
          ) : (
            !request &&
            data.canReview && (
              <>
                {preview ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await post<{ status: string }>(
                          `/transactions/${data.transaction.id}/reconcile`,
                          {
                            revision: data.transaction.revision,
                            idempotencyKey: key.current,
                            ...preview,
                          },
                        )
                        finish(
                          result.status === 'pending'
                            ? 'Request sent to the Owner'
                            : 'Reconciliation saved',
                        )
                      })
                    }
                  >
                    {busy
                      ? 'Saving…'
                      : data.owner
                        ? 'Confirm reconciliation'
                        : 'Submit for approval'}
                  </Button>
                ) : (
                  <Button variant="primary" disabled={busy}>
                    {busy ? 'Checking…' : 'Review before saving'}
                  </Button>
                )}
              </>
            )
          )}
        </footer>
      </form>
    </Modal>
  )
}
