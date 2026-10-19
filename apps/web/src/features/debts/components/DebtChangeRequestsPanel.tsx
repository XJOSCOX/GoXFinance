import { useCategories } from '../../categories/hooks/useCategories'
import { PaymentReviewSummary } from './PaymentReviewSummary'
import { formatMoney } from '../../../lib/money'
import { useCallback, useEffect, useState } from 'react'
import {
  debtChangeLabels,
  type DebtChangeRequest,
  type HouseholdMember,
  type Debt,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { listDebtChanges, reviewDebtChange } from '../api/changeClient'

const display = (key: string, value: unknown) =>
  value == null
    ? 'Unknown'
    : key.endsWith('Cents') && typeof value === 'number'
      ? formatMoney(value)
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value).replaceAll('_', ' ')

export function DebtChangeRequestsPanel({
  householdId,
  debtId,
  owner,
  refreshToken = 0,
  onChanged,
  hideEmpty = false,
  members = [],
  debts = [],
}: {
  householdId: string
  debtId?: string
  owner: boolean
  refreshToken?: number
  onChanged: () => Promise<void>
  hideEmpty?: boolean
  members?: HouseholdMember[]
  debts?: Debt[]
}) {
  const { categories } = useCategories(householdId)
  function displayValue(key: string, value: unknown) {
    if (key === 'categoryId')
      return (
        categories.find((category) => category.id === value)?.name ??
        (value ? 'Category unavailable' : 'No category')
      )
    if (key === 'memberAssignments' && Array.isArray(value))
      return value
        .map((item) => {
          const assignment = item as { memberId: string; responsibility: string }
          return (
            (members.find((member) => member.id === assignment.memberId)?.fullName ??
              assignment.memberId) +
            ' (' +
            assignment.responsibility +
            ')'
          )
        })
        .join(', ')
    if (key === 'linkedOriginalDebtId' && typeof value === 'string') {
      const linked = debts.find((debt) => debt.id === value)
      return linked
        ? linked.creditorName + (linked.accountNickname ? ' · ' + linked.accountNickname : '')
        : value
    }
    return display(key, value)
  }
  const notify = useNotify()
  const [requests, setRequests] = useState<DebtChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [review, setReview] = useState<DebtChangeRequest | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setRequests((await listDebtChanges(householdId)).requests)
      setError('')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setLoading(false)
    }
  }, [householdId])
  useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])
  const visible = requests
    .filter((item) => !debtId || item.debtId === debtId)
    .sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending'))
  async function decide(action: 'approve' | 'reject' | 'cancel') {
    if (!review || busy) return
    setBusy(true)
    setError('')
    try {
      await reviewDebtChange(householdId, review.id, action, note.trim() || null)
      await refresh()
      await onChanged()
      setReview(null)
      notify(
        'success',
        action === 'approve'
          ? 'Change approved and applied'
          : action === 'reject'
            ? 'Request rejected'
            : 'Request withdrawn',
      )
    } catch (failure) {
      const message = errorMessage(failure)
      setError(message)
      notify('error', message)
    } finally {
      setBusy(false)
    }
  }
  if (hideEmpty && !loading && !error && !visible.length) return null
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{owner ? 'Owner approvals' : 'Your change requests'}</h2>
        <Button size="small" variant="ghost" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-3 text-sm text-slate-400">
          Loading requests…
        </p>
      ) : !visible.length ? (
        <p className="mt-3 text-sm text-slate-400">No change requests.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {visible.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.08] p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {debtChangeLabels[item.action]} · {item.creditorName}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.proposedByName} · {new Date(item.createdAt).toLocaleDateString()} ·{' '}
                  <span className="capitalize">{item.status}</span>
                </p>
              </div>
              <Button
                size="small"
                onClick={() => {
                  setReview(item)
                  setNote('')
                  setError('')
                }}
              >
                Review
              </Button>
            </div>
          ))}
        </div>
      )}
      {review && (
        <Modal
          title={debtChangeLabels[review.action]}
          onClose={() => setReview(null)}
          className="max-w-2xl"
        >
          <p className="text-sm text-slate-400">
            {review.creditorName} · Requested by {review.proposedByName}
          </p>
          <p className="my-4 whitespace-pre-wrap text-sm">{review.reason}</p>
          {review.paymentId &&
            (review.action === 'confirm_payment' || review.action === 'cancel_payment') && (
              <PaymentReviewSummary values={review.originalValues} />
            )}
          {review.action === 'confirm_payment' && (
            <p className="mb-4 text-sm text-slate-400">
              Approve only after this payment has actually cleared.
            </p>
          )}
          {review.action === 'archive_account' || review.action === 'restore_account' ? (
            <p className="rounded-lg border border-white/10 p-3 text-sm">
              Change archive state from {review.originalValues.isArchived ? 'archived' : 'active'}{' '}
              to {review.action === 'archive_account' ? 'archived' : 'active'}.
            </p>
          ) : review.action === 'cancel_payment' || review.action === 'confirm_payment' ? (
            <p className="rounded-lg border border-white/10 p-3 text-sm">
              Change status from {display('paymentStatus', review.originalValues.paymentStatus)} to{' '}
              {review.action === 'cancel_payment' ? 'cancelled' : 'completed'}.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 border-b border-white/10 pb-2 text-xs font-semibold text-slate-400">
                <span>Field</span>
                <span>Current</span>
                <span>Proposed</span>
              </div>
              {Object.entries(review.proposedChanges)
                .filter(([key]) => key !== 'idempotencyKey')
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-3 gap-2 border-b border-white/[.06] py-2 text-xs"
                  >
                    <span className="capitalize text-slate-400">
                      {key.replace(/([A-Z])/g, ' $1').replace(' Cents', '')}
                    </span>
                    <span className="break-words">
                      {displayValue(key, review.originalValues[key] ?? null)}
                    </span>
                    <span className="break-words text-[#bfcebd]">{displayValue(key, value)}</span>
                  </div>
                ))}
            </div>
          )}
          {review.status !== 'pending' && (
            <p className="mt-4 text-sm text-slate-400">
              {review.status} · {review.reviewedAt && new Date(review.reviewedAt).toLocaleString()}
              {review.reviewNote && ` · ${review.reviewNote}`}
            </p>
          )}
          {review.status === 'pending' && (
            <>
              <label className="mt-4 block text-xs text-slate-400">
                {owner ? 'Review note (optional)' : 'Withdrawal note (optional)'}
                <textarea
                  value={note}
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-2 h-20 w-full rounded-lg border border-white/10 bg-[#151716] p-3 text-sm"
                />
              </label>
              <p className="mt-3 text-xs text-slate-500">
                {owner
                  ? 'Approval applies the exact proposed change. Rejecting preserves the current record.'
                  : 'The live record stays unchanged until the Owner approves.'}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button onClick={() => setReview(null)}>Close</Button>
            {review.status === 'pending' &&
              (owner ? (
                <>
                  <Button disabled={busy} onClick={() => void decide('reject')}>
                    Confirm rejection
                  </Button>
                  <Button variant="primary" disabled={busy} onClick={() => void decide('approve')}>
                    Approve change
                  </Button>
                </>
              ) : (
                <Button disabled={busy} onClick={() => void decide('cancel')}>
                  Withdraw request
                </Button>
              ))}
          </div>
        </Modal>
      )}
    </Card>
  )
}
