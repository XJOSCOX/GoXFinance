import { useState, type FormEvent } from 'react'
import { debtPaymentStatusLabels, paymentMethodLabels, type DebtPayment, type DebtPaymentInput } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { moneyText, parseMoney } from '../lib/money'

const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

export function PaymentFormDialog({ payment, onClose, onSave }: {
  payment?: DebtPayment | null; onClose: () => void; onSave: (input: DebtPaymentInput) => Promise<void>
}) {
  const [amount, setAmount] = useState(moneyText(payment?.amountCents))
  const [principal, setPrincipal] = useState(moneyText(payment?.principalAmountCents))
  const [interest, setInterest] = useState(moneyText(payment?.interestAmountCents))
  const [fees, setFees] = useState(moneyText(payment?.feesAmountCents))
  const [date, setDate] = useState(payment?.paymentDate ?? today())
  const [status, setStatus] = useState<DebtPaymentInput['paymentStatus']>(payment?.paymentStatus ?? 'pending')
  const [method, setMethod] = useState<DebtPaymentInput['paymentMethod']>(payment?.paymentMethod ?? 'bank_transfer')
  const [reference, setReference] = useState(payment?.referenceNumber ?? '')
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [key] = useState(() => payment?.idempotencyKey ?? crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    try {
      const amountCents = parseMoney(amount, true)!
      const principalAmountCents = parseMoney(principal)
      const interestAmountCents = parseMoney(interest)
      const feesAmountCents = parseMoney(fees)
      if (amountCents <= 0) throw new Error('Payment amount must be greater than zero')
      if ((principalAmountCents ?? 0) + (interestAmountCents ?? 0) + (feesAmountCents ?? 0) > amountCents) {
        throw new Error('Principal, interest, and fees cannot exceed the payment')
      }
      setError(''); setBusy(true)
      await onSave({ idempotencyKey: key, amountCents, paymentDate: date, paymentStatus: status,
        paymentMethod: method, principalAmountCents, interestAmountCents, feesAmountCents,
        referenceNumber: reference.trim() || null, notes: notes.trim() || null })
      onClose()
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  const label = 'mb-1 block text-xs font-medium text-slate-400'
  const select = 'h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-sm text-white'
  const statuses = payment?.paymentStatus === 'completed' ? ['completed'] : payment ? ['scheduled', 'pending', 'failed'] : ['scheduled', 'pending', 'completed', 'failed']
  return <Modal title={payment ? 'Edit payment' : 'Record payment'} onClose={onClose}><form onSubmit={event => void submit(event)} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><label><span className={label}>Amount *</span><Input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
      <label><span className={label}>Payment date *</span><Input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label><span className={label}>Status</span><select className={select} value={status} onChange={event => setStatus(event.target.value as DebtPaymentInput['paymentStatus'])}>{statuses.map(value => <option key={value} value={value}>{debtPaymentStatusLabels[value as keyof typeof debtPaymentStatusLabels]}</option>)}</select></label>
      <label><span className={label}>Method</span><select className={select} value={method} onChange={event => setMethod(event.target.value as DebtPaymentInput['paymentMethod'])}>{Object.entries(paymentMethodLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label></div>
    <div className="border-t border-white/[.08] pt-4"><p className="text-sm font-medium">Payment breakdown</p><p className="mt-1 text-xs text-slate-500">Leave unknown portions blank. Only known principal is used in the balance estimate.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3"><label><span className={label}>Principal</span><Input inputMode="decimal" value={principal} onChange={event => setPrincipal(event.target.value)} placeholder="Unknown" /></label><label><span className={label}>Interest</span><Input inputMode="decimal" value={interest} onChange={event => setInterest(event.target.value)} placeholder="Unknown" /></label><label><span className={label}>Fees</span><Input inputMode="decimal" value={fees} onChange={event => setFees(event.target.value)} placeholder="Unknown" /></label></div></div>
    <label className="block"><span className={label}>Reference number</span><Input maxLength={120} value={reference} onChange={event => setReference(event.target.value)} /></label>
    <label className="block"><span className={label}>Notes</span><textarea className={select + ' h-24 py-2'} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</Button></div>
  </form></Modal>
}
