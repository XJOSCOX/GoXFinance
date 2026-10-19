import { useEffect, useRef, useState } from 'react'
import { billAverage, type BillAction, type BillPayment, type BillView } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, MoneyField, Select } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { BillAmountSummary } from './BillAmountSummary'
import { BillPaymentForm } from './BillPaymentForm'
import { recordBillPayment } from '../api/billClient'
import { BillAuditHistory } from './BillAuditHistory'

export function BillDetails({
  bill,
  close,
  act,
  changed,
  startPayment = false,
}: {
  bill: BillView
  close: () => void
  act: (action: BillAction) => Promise<void>
  startPayment?: boolean
  changed: () => Promise<void>
}) {
  const [periodId, setPeriodId] = useState(
    bill.periods.find((item) => !['paid', 'credited', 'overpaid'].includes(item.paymentStatus))
      ?.id ??
      bill.periods[0]?.id ??
      '',
  )
  const period = bill.periods.find((item) => item.id === periodId)
  const [payment, setPayment] = useState<BillPayment | null | undefined>(undefined),
    [editing, setEditing] = useState(false)
  const openedPayment = useRef(false)
  useEffect(() => {
    if (startPayment && bill.canManage && period && !openedPayment.current) {
      openedPayment.current = true
      setPayment(null)
    }
  }, [startPayment, bill.canManage, period])
  const [amount, setAmount] = useState<number | null>(null),
    [credit, setCredit] = useState<number | null>(0),
    [notes, setNotes] = useState('')
  const [windowSize, setWindowSize] = useState<3 | 6 | 12>(3),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const average = billAverage(bill.periods, windowSize)
  async function run(action: BillAction) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await act(action)
      setEditing(false)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={bill.name} onClose={close} framed className="max-w-3xl">
      <div className="dialog-scroll min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
        <p className="text-sm text-slate-400">
          {bill.category} · {bill.kind === 'recurring' ? bill.frequency : 'One-time'} ·{' '}
          {bill.status}
          {bill.autoPay ? ' · Auto-pay' : ''}
        </p>
        {bill.requiresApproval && (
          <p className="text-sm text-amber-200">Sensitive changes require Owner approval.</p>
        )}
        <FormField label="Billing period / due date">
          <Select
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value)
              setEditing(false)
            }}
          >
            {bill.periods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.billingPeriod} · Due {item.dueDate} ·{' '}
                {item.paymentStatus.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </FormField>
        {period ? (
          <>
            <BillAmountSummary period={period} />
            {bill.canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setAmount(period.amountCents)
                    setCredit(period.creditCents)
                    setNotes(period.notes ?? '')
                    setEditing(true)
                  }}
                >
                  Enter actual bill / credit
                </Button>
                <Button
                  variant="primary"
                  disabled={bill.status === 'cancelled'}
                  onClick={() => setPayment(null)}
                >
                  Record payment
                </Button>
              </div>
            )}
            {editing && (
              <form
                className="space-y-3 rounded-lg border border-white/10 p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run({
                    action: 'edit_period',
                    periodId,
                    changes: {
                      amountCents: amount,
                      creditCents: credit ?? 0,
                      notes: notes || null,
                    },
                  })
                }}
              >
                <MoneyField label="Actual billed amount ($)" value={amount} onChange={setAmount} />
                <MoneyField label="Explicit credit ($)" value={credit} onChange={setCredit} />
                <FormField label="Amount / credit notes">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </FormField>
                <Button disabled={busy} variant="primary">
                  {bill.requiresApproval ? 'Request change' : 'Save actual amount'}
                </Button>
              </form>
            )}
            <section>
              <h3 className="mb-3 font-semibold">Payment history</h3>
              {bill.payments.filter((item) => item.periodId === periodId).length === 0 && (
                <p className="text-sm text-slate-400">No payments recorded for this period.</p>
              )}
              {bill.payments
                .filter((item) => item.periodId === periodId)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3 text-sm"
                  >
                    <div>
                      <p>
                        {formatMoney(item.amountCents)} · {item.paymentDate}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.status}
                        {item.debtPaymentId ? ' · Linked debt payment' : ''}
                      </p>
                    </div>
                    {bill.canManage && item.status !== 'cancelled' && (
                      <div className="flex flex-wrap gap-2">
                        {['pending', 'scheduled'].includes(item.status) && (
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `Confirm ${formatMoney(item.amountCents)} paid on ${item.paymentDate}?`,
                                )
                              )
                                void run({ action: 'confirm_payment', paymentId: item.id })
                            }}
                          >
                            {bill.requiresApproval ? 'Request confirmation' : 'Confirm payment'}
                          </Button>
                        )}
                        <Button size="small" onClick={() => setPayment(item)}>
                          Correct
                        </Button>
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => {
                            if (confirm('Cancel this payment? Its audit history will remain.'))
                              void run({ action: 'cancel_payment', paymentId: item.id })
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
            </section>
            {payment !== undefined && (
              <BillPaymentForm
                period={period}
                billRevision={bill.revision}
                allowCompleted={!bill.requiresApproval}
                payment={payment ?? undefined}
                close={() => setPayment(undefined)}
                save={async (input) => {
                  if (payment) {
                    const { idempotencyKey: _, ...changes } = input
                    void _
                    await act({ action: 'edit_payment', paymentId: payment.id, changes })
                  } else {
                    await recordBillPayment(bill.householdId, bill.id, periodId, input)
                    await changed()
                  }
                }}
              />
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            No billing periods. Activate this bill to generate its schedule.
          </p>
        )}
        {bill.amountType === 'variable' && (
          <section className="rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Completed-period average</h3>
              <Select
                className="w-auto"
                value={windowSize}
                onChange={(e) => setWindowSize(Number(e.target.value) as 3 | 6 | 12)}
              >
                {[3, 6, 12].map((count) => (
                  <option key={count} value={count}>
                    Last {count} periods
                  </option>
                ))}
              </Select>
            </div>
            <p className="mt-3 text-sm">
              {formatMoney(average.averageCents)} · {average.sampleCount} completed periods
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Separate from your budget estimate. Only periods with actual amounts are included.
            </p>
            {bill.canManage && average.averageCents !== null && (
              <Button
                className="mt-3"
                size="small"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      'Use this calculated average for future estimates? Existing periods will stay unchanged.',
                    )
                  )
                    void run({
                      action: 'edit_bill',
                      changes: {
                        name: bill.name,
                        category: bill.category,
                        kind: bill.kind,
                        amountType: bill.amountType,
                        amountCents: bill.amountCents,
                        estimatedAmountCents: average.averageCents,
                        frequency: bill.frequency,
                        nextDueDate: bill.nextDueDate,
                        endDate: bill.endDate,
                        autoPay: bill.autoPay,
                        status: bill.status,
                        notes: bill.notes,
                        linkedDebtId: bill.linkedDebtId,
                        memberIds: bill.memberIds,
                      },
                    })
                }}
              >
                Use as future estimate
              </Button>
            )}
          </section>
        )}
        {bill.notes && <p className="whitespace-pre-wrap text-sm text-slate-400">{bill.notes}</p>}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <BillAuditHistory home={bill.householdId} billId={bill.id} revision={bill.revision} />
      </div>
      <footer className="flex justify-end border-t border-white/10 p-4">
        <Button onClick={close}>Close</Button>
      </footer>
    </Modal>
  )
}
