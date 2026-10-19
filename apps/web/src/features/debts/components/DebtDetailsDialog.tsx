import { useState } from 'react'
import { accountStatusLabels, paymentStatusLabels, type Debt, type DebtPayment, type DebtPaymentInput } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { cancelPayment, confirmPayment, createPayment, getPayment, updatePayment, verifyDebtBalance, type PaymentAuditEntry } from '../api/paymentClient'
import { useDebtActivity } from '../hooks/useDebtActivity'
import { BalanceHistory } from './BalanceHistory'
import { PaymentFormDialog } from './PaymentFormDialog'
import { PaymentHistory } from './PaymentHistory'
import { VerifiedBalanceDialog } from './VerifiedBalanceDialog'

const money = (cents: number | null) => cents == null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
type Tab = 'overview' | 'payments' | 'balances'

export function DebtDetailsDialog({ householdId, debt, canCreate, canModify, onClose, onDebtChanged }: {
  householdId: string; debt: Debt; canCreate: boolean; canModify: boolean; onClose: () => void; onDebtChanged: () => Promise<void>
}) {
  const notify = useNotify()
  const { payments, history, overview, loading, error, refresh } = useDebtActivity(householdId, debt.id)
  const [tab, setTab] = useState<Tab>('overview')
  const [formPayment, setFormPayment] = useState<DebtPayment | null | undefined>(undefined)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<DebtPayment | null>(null)
  const [audit, setAudit] = useState<{ payment: DebtPayment; entries: PaymentAuditEntry[] } | null>(null)
  const [busy, setBusy] = useState(false)
  async function savePayment(input: DebtPaymentInput) {
    if (formPayment) {
      const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'idempotencyKey')) as Omit<DebtPaymentInput, 'idempotencyKey'>
      await updatePayment(householdId, debt.id, formPayment.id, changes)
    } else await createPayment(householdId, debt.id, input)
    await refresh()
    notify('success', formPayment ? 'Payment updated' : 'Payment recorded')
  }
  async function confirm(payment: DebtPayment) {
    if (busy) return
    setBusy(true)
    try { await confirmPayment(householdId, debt.id, payment.id); await refresh(); notify('success', 'Scheduled payment confirmed') }
    catch (failure) { notify('error', errorMessage(failure)) }
    finally { setBusy(false) }
  }
  async function cancel() {
    if (!cancelTarget || busy) return
    setBusy(true)
    try { await cancelPayment(householdId, debt.id, cancelTarget.id); await refresh(); notify('success', 'Payment cancelled'); setCancelTarget(null) }
    catch (failure) { notify('error', errorMessage(failure)) }
    finally { setBusy(false) }
  }
  async function showAudit(payment: DebtPayment) {
    try { const result = await getPayment(householdId, debt.id, payment.id); setAudit({ payment, entries: result.audit }) }
    catch (failure) { notify('error', errorMessage(failure)) }
  }
  async function verify(input: { balanceCents: number; effectiveDate: string; source: 'creditor_statement' | 'reconciliation'; notes: string | null }) {
    await verifyDebtBalance(householdId, debt.id, input)
    await Promise.all([refresh(), onDebtChanged()])
    notify('success', 'Verified balance recorded')
  }
  const fields = [
    ['Current recorded balance', money(debt.currentBalanceCents)], ['Original balance', money(debt.originalBalanceCents)],
    ['Minimum payment', money(debt.minimumPaymentCents)], ['Past due', money(debt.pastDueAmountCents)],
    ['APR', debt.interestRateApr ? `${debt.interestRateApr}%` : 'Unknown'], ['Next due date', debt.nextDueDate ?? 'Unknown'],
    ['Account status', accountStatusLabels[debt.accountStatus]], ['Payment status', paymentStatusLabels[debt.paymentStatus]],
    ['Balance confidence', debt.confidence], ['Collection agency', debt.collectionAgency ?? 'None'],
    ['Original creditor', debt.originalCreditor ?? 'Unknown'],
  ]
  return <Modal title={debt.creditorName} onClose={onClose} className="max-w-3xl">
    <div className="mb-5 flex flex-wrap gap-1 border-b border-white/10 pb-3" role="tablist" aria-label="Debt details">
      {([['overview', 'Overview'], ['payments', 'Payments'], ['balances', 'Balance history']] as const).map(([value, label]) =>
        <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${tab === value ? 'bg-[#aab9a9]/[.13] font-medium text-[#d8e5d7]' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'}`}>{label}</button>)}
    </div>
    {tab === 'overview' && <div><dl className="grid gap-4 sm:grid-cols-2">{fields.map(([name, value]) => <div key={name} className="border-b border-white/[.06] pb-3"><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>{debt.notes && <div className="mt-5"><p className="text-xs text-slate-500">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{debt.notes}</p></div>}</div>}
    {tab !== 'overview' && (loading ? <p role="status" className="py-8 text-sm text-slate-400">Loading history…</p> : error ? <div><p role="alert" className="text-sm text-rose-300">{error}</p><Button className="mt-3" onClick={() => void refresh()}>Try again</Button></div> : overview && (
      tab === 'payments' ? <PaymentHistory payments={payments} overview={overview} canCreate={canCreate} canModify={canModify} busy={busy}
        onAdd={() => setFormPayment(null)} onEdit={setFormPayment} onCancel={setCancelTarget} onConfirm={payment => void confirm(payment)} onAudit={payment => void showAudit(payment)} />
        : <BalanceHistory history={history} overview={overview} canVerify={canModify} onVerify={() => setVerifyOpen(true)} />))}
    {formPayment !== undefined && <PaymentFormDialog key={formPayment?.id ?? 'new'} payment={formPayment} onClose={() => setFormPayment(undefined)} onSave={savePayment} />}
    {verifyOpen && <VerifiedBalanceDialog onClose={() => setVerifyOpen(false)} onSave={verify} />}
    {cancelTarget && <Modal title="Cancel payment?" onClose={() => setCancelTarget(null)}><p className="text-sm leading-6 text-slate-400">This keeps the payment and its change history, but removes it from completed totals and balance estimates.</p><div className="mt-5 flex justify-end gap-2"><Button onClick={() => setCancelTarget(null)}>Keep payment</Button><Button variant="primary" disabled={busy} onClick={() => void cancel()}>{busy ? 'Saving…' : 'Cancel payment'}</Button></div></Modal>}
    {audit && <Modal title="Payment changes" onClose={() => setAudit(null)}><p className="mb-4 text-sm text-slate-400">{money(audit.payment.amountCents)} · {audit.payment.paymentDate}</p><ol className="space-y-2">{audit.entries.map(entry => <li key={entry.id} className="rounded-lg border border-white/[.07] p-3 text-sm"><span className="capitalize">{entry.action}</span><span className="ml-2 text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span></li>)}</ol></Modal>}
  </Modal>
}
