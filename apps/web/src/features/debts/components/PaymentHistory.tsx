import { useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { debtPaymentStatusLabels, paymentMethodLabels, type DebtPayment, type DebtPaymentOverview } from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function PaymentHistory({ payments, overview, canCreate, canModify, busy, onAdd, onEdit, onCancel, onConfirm, onAudit }: {
  payments: DebtPayment[]; overview: DebtPaymentOverview; canCreate: boolean; canModify: boolean; busy: boolean;
  onAdd: () => void; onEdit: (payment: DebtPayment) => void; onCancel: (payment: DebtPayment) => void;
  onConfirm: (payment: DebtPayment) => void; onAudit: (payment: DebtPayment) => void
}) {
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState('')
  const filtered = useMemo(() => payments.filter(payment => (!month || payment.paymentDate.startsWith(month)) &&
    (!status || payment.paymentStatus === status)), [payments, month, status])
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Card className="p-4"><p className="text-xs text-slate-400">Completed payments</p><p className="mt-2 text-xl font-semibold">{money(overview.completedPaymentTotalCents)}</p></Card><Card className="p-4"><p className="text-xs text-slate-400">Known principal paid</p><p className="mt-2 text-xl font-semibold">{money(overview.principalReductionTotalCents)}</p></Card></div>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Payment history</h3><p className="mt-1 text-xs text-slate-500">Scheduled payments are excluded from completed totals.</p></div>{canCreate && <Button variant="primary" size="small" onClick={onAdd}>Record payment</Button>}</div>
    {payments.length > 0 && <div className="grid gap-2 sm:grid-cols-2"><Input type="month" aria-label="Filter payments by month" value={month} onChange={event => setMonth(event.target.value)} /><select aria-label="Filter payments by status" className="h-10 rounded-lg border border-white/10 bg-[#151716] px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(debtPaymentStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>}
    {filtered.length ? <div className="space-y-2">{filtered.map(payment => <div key={payment.id} className="rounded-xl border border-white/[.08] bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{money(payment.amountCents)}</p><p className="mt-1 text-xs text-slate-400">{payment.paymentDate} · {paymentMethodLabels[payment.paymentMethod]}</p></div><span className="rounded-md border border-white/10 bg-white/[.04] px-2.5 py-1 text-xs text-slate-300">{debtPaymentStatusLabels[payment.paymentStatus]}</span></div>
      {(payment.principalAmountCents !== null || payment.interestAmountCents !== null || payment.feesAmountCents !== null) && <p className="mt-3 text-xs text-slate-400">{payment.principalAmountCents !== null && `Principal ${money(payment.principalAmountCents)}`}{payment.interestAmountCents !== null && ` · Interest ${money(payment.interestAmountCents)}`}{payment.feesAmountCents !== null && ` · Fees ${money(payment.feesAmountCents)}`}</p>}
      {payment.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{payment.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-1 border-t border-white/[.06] pt-3"><Button size="small" variant="ghost" onClick={() => onAudit(payment)}>Changes</Button>{canModify && payment.paymentStatus !== 'cancelled' && <><Button size="small" variant="ghost" onClick={() => onEdit(payment)}>Edit</Button>{(payment.paymentStatus === 'scheduled' || payment.paymentStatus === 'pending') && <Button size="small" variant="ghost" disabled={busy} onClick={() => onConfirm(payment)}>Confirm</Button>}<Button size="small" variant="ghost" disabled={busy} onClick={() => onCancel(payment)}>Cancel</Button></>}</div>
    </div>)}</div> : <Card className="flex flex-col items-center px-6 py-10 text-center"><CalendarDays size={22} className="text-[#aab9a9]"/><p className="mt-3 text-sm font-medium">{payments.length ? 'No payments match these filters' : 'No payments recorded'}</p><p className="mt-1 text-xs text-slate-400">{payments.length ? 'Try another month or status.' : 'Recorded and scheduled payments will appear here.'}</p></Card>}
  </div>
}
