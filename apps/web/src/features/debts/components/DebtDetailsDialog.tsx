import { useEffect, useRef, useState } from 'react'
import {
  accountStatusLabels,
  paymentStatusLabels,
  type Debt,
  type DebtPayment,
  type DebtPaymentInput,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import {
  cancelPayment,
  confirmPayment,
  createPayment,
  getPayment,
  updatePayment,
  verifyDebtBalance,
  type PaymentAuditEntry,
} from '../api/paymentClient'
import { useDebtActivity } from '../hooks/useDebtActivity'
import { BalanceHistory } from './BalanceHistory'
import { PaymentFormDialog } from './PaymentFormDialog'
import { PaymentHistory } from './PaymentHistory'
import { VerifiedBalanceDialog } from './VerifiedBalanceDialog'
import { submitDebtChange } from '../api/changeClient'
import { DebtChangeRequestsPanel } from './DebtChangeRequestsPanel'
import { RequestActionDialog } from './RequestActionDialog'

const money = (cents: number | null) =>
  cents == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
type Tab = 'overview' | 'payments' | 'balances' | 'requests'

export function DebtDetailsDialog({
  householdId,
  debt,
  canCreate,
  canModify,
  owner,
  members = [],
  debts = [],
  onClose,
  onDebtChanged,
  recordPayment = false,
}: {
  householdId: string
  debt: Debt
  members?: HouseholdMember[]
  debts?: Debt[]
  canCreate: boolean
  canModify: boolean
  owner: boolean
  onClose: () => void
  onDebtChanged: () => Promise<void>
  recordPayment?: boolean
}) {
  const notify = useNotify()
  const { payments, history, overview, loading, error, refresh } = useDebtActivity(
    householdId,
    debt.id,
  )
  const [tab, setTab] = useState<Tab>(recordPayment ? 'payments' : 'overview')
  const [formPayment, setFormPayment] = useState<DebtPayment | null | undefined>(undefined)
  const openedPayment = useRef(false)
  useEffect(() => {
    if (recordPayment && canCreate && !openedPayment.current) {
      openedPayment.current = true
      setFormPayment(null)
    }
  }, [recordPayment, canCreate])
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<DebtPayment | null>(null)
  const [audit, setAudit] = useState<{ payment: DebtPayment; entries: PaymentAuditEntry[] } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [requestAction, setRequestAction] = useState<{
    payment: DebtPayment
    action: 'cancel_payment' | 'confirm_payment'
  } | null>(null)
  const canRequest = canCreate && !canModify
  async function savePayment(input: DebtPaymentInput, reason?: string) {
    if (formPayment) {
      const changes = Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'idempotencyKey'),
      ) as Omit<DebtPaymentInput, 'idempotencyKey'>
      if (canRequest)
        await submitDebtChange(householdId, debt.id, {
          action: 'edit_payment',
          paymentId: formPayment.id,
          changes,
          reason: reason ?? '',
          idempotencyKey: input.idempotencyKey,
        })
      else await updatePayment(householdId, debt.id, formPayment.id, changes)
    } else await createPayment(householdId, debt.id, input)
    await refresh()
    notify(
      'success',
      formPayment && canRequest
        ? 'Submitted for Owner approval'
        : formPayment
          ? 'Payment updated'
          : 'Payment recorded',
    )
    if (formPayment && canRequest) {
      setTab('requests')
      await onDebtChanged()
    }
  }
  async function confirm(payment: DebtPayment) {
    if (busy) return
    setBusy(true)
    try {
      await confirmPayment(householdId, debt.id, payment.id)
      await refresh()
      notify('success', 'Scheduled payment confirmed')
    } catch (failure) {
      notify('error', errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    if (!cancelTarget || busy) return
    setBusy(true)
    try {
      await cancelPayment(householdId, debt.id, cancelTarget.id)
      await refresh()
      notify('success', 'Payment cancelled')
      setCancelTarget(null)
    } catch (failure) {
      notify('error', errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  async function showAudit(payment: DebtPayment) {
    try {
      const result = await getPayment(householdId, debt.id, payment.id)
      setAudit({ payment, entries: result.audit })
    } catch (failure) {
      notify('error', errorMessage(failure))
    }
  }
  async function verify(
    input: {
      balanceCents: number
      effectiveDate: string
      source: 'creditor_statement' | 'reconciliation'
      notes: string | null
      idempotencyKey?: string
    },
    reason?: string,
  ) {
    if (canRequest)
      await submitDebtChange(householdId, debt.id, {
        action: 'verify_balance',
        changes: input,
        reason: reason ?? '',
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
      })
    else await verifyDebtBalance(householdId, debt.id, input)
    await Promise.all([refresh(), onDebtChanged()])
    notify('success', canRequest ? 'Submitted for Owner approval' : 'Verified balance recorded')
    if (canRequest) setTab('requests')
  }
  const fields = [
    ['Current recorded balance', money(debt.currentBalanceCents)],
    ['Original balance', money(debt.originalBalanceCents)],
    ['Minimum payment', money(debt.minimumPaymentCents)],
    ['Past due', money(debt.pastDueAmountCents)],
    ['APR', debt.interestRateApr ? `${debt.interestRateApr}%` : 'Unknown'],
    ['Next due date', debt.nextDueDate ?? 'Unknown'],
    ['Account status', accountStatusLabels[debt.accountStatus]],
    ['Payment status', paymentStatusLabels[debt.paymentStatus]],
    ['Balance confidence', debt.confidence],
    ['Collection agency', debt.collectionAgency ?? 'None'],
    ['Original creditor', debt.originalCreditor ?? 'Unknown'],
  ]
  return (
    <Modal title={debt.creditorName} onClose={onClose} className="max-w-3xl">
      <div
        className="mb-5 flex flex-wrap gap-1 border-b border-white/10 pb-3"
        role="tablist"
        aria-label="Debt details"
      >
        {(
          [
            ['overview', 'Overview'],
            ['payments', 'Payments'],
            ['balances', 'Balance history'],
            ['requests', 'Approvals'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const buttons = Array.from(
                event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              )
              const index = buttons.indexOf(event.currentTarget)
              const target =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                      buttons.length
              buttons[target].focus()
              buttons[target].click()
            }}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${tab === value ? 'bg-[#aab9a9]/[.13] font-medium text-[#d8e5d7]' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div>
          <dl className="grid gap-4 sm:grid-cols-2">
            {fields.map(([name, value]) => (
              <div key={name} className="border-b border-white/[.06] pb-3">
                <dt className="text-xs text-slate-500">{name}</dt>
                <dd className="mt-1 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {debt.notes && (
            <div className="mt-5">
              <p className="text-xs text-slate-500">Notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{debt.notes}</p>
            </div>
          )}
        </div>
      )}
      {tab === 'requests' && (
        <DebtChangeRequestsPanel
          members={members}
          debts={debts}
          householdId={householdId}
          debtId={debt.id}
          owner={owner}
          onChanged={async () => {
            await refresh()
            await onDebtChanged()
          }}
        />
      )}
      {(tab === 'payments' || tab === 'balances') &&
        (loading ? (
          <p role="status" className="py-8 text-sm text-slate-400">
            Loading history…
          </p>
        ) : error ? (
          <div>
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
            <Button className="mt-3" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : (
          overview &&
          (tab === 'payments' ? (
            <PaymentHistory
              payments={payments}
              overview={overview}
              canCreate={canCreate}
              canModify={canModify || canRequest}
              busy={busy}
              requestMode={canRequest}
              onAdd={() => setFormPayment(null)}
              onEdit={setFormPayment}
              onCancel={(payment) =>
                canRequest
                  ? setRequestAction({ payment, action: 'cancel_payment' })
                  : setCancelTarget(payment)
              }
              onConfirm={(payment) =>
                canRequest
                  ? setRequestAction({ payment, action: 'confirm_payment' })
                  : void confirm(payment)
              }
              onAudit={(payment) => void showAudit(payment)}
            />
          ) : (
            <BalanceHistory
              history={history}
              overview={overview}
              canVerify={canModify || canRequest}
              requestMode={canRequest}
              onVerify={() => setVerifyOpen(true)}
            />
          ))
        ))}
      {formPayment !== undefined && (
        <PaymentFormDialog
          key={formPayment?.id ?? 'new'}
          payment={formPayment}
          debt={debt}
          allowCompleted={canModify}
          requestMode={Boolean(formPayment) && canRequest}
          onClose={() => setFormPayment(undefined)}
          onSave={savePayment}
        />
      )}
      {verifyOpen && (
        <VerifiedBalanceDialog
          onClose={() => setVerifyOpen(false)}
          onSave={verify}
          requestMode={canRequest}
        />
      )}
      {requestAction && (
        <RequestActionDialog
          title={
            requestAction.action === 'cancel_payment'
              ? 'Request cancellation'
              : 'Request confirmation'
          }
          onClose={() => setRequestAction(null)}
          onSubmit={async (reason, idempotencyKey) => {
            await submitDebtChange(householdId, debt.id, {
              action: requestAction.action,
              paymentId: requestAction.payment.id,
              reason,
              idempotencyKey,
            })
            await onDebtChanged()
            notify('success', 'Submitted for Owner approval')
            setTab('requests')
          }}
        />
      )}
      {cancelTarget && (
        <Modal title="Cancel payment?" onClose={() => setCancelTarget(null)}>
          <p className="text-sm leading-6 text-slate-400">
            This keeps the payment and its change history, but removes it from completed totals and
            balance estimates.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setCancelTarget(null)}>Keep payment</Button>
            <Button variant="primary" disabled={busy} onClick={() => void cancel()}>
              {busy ? 'Saving…' : 'Cancel payment'}
            </Button>
          </div>
        </Modal>
      )}
      {audit && (
        <Modal title="Payment changes" onClose={() => setAudit(null)}>
          <p className="mb-4 text-sm text-slate-400">
            {money(audit.payment.amountCents)} · {audit.payment.paymentDate}
          </p>
          <ol className="space-y-2">
            {audit.entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-white/[.07] p-3 text-sm">
                <span className="capitalize">{entry.action}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </Modal>
  )
}
