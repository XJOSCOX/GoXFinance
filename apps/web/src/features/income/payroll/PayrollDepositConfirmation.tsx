import { useRef, useState } from 'react'
import { bankDecimalCents } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { errorMessage } from '../../../lib/api'
export type PayrollReceipt = { date: string; amountCents: number }
export function PayrollDepositConfirmation({
  date,
  amountCents,
  save,
  disabled,
}: {
  date: string | null
  amountCents: number | null
  save: (values: PayrollReceipt) => Promise<void>
  disabled?: boolean
}) {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <form
      className="mt-4 grid items-end gap-3 rounded-lg border border-emerald-300/15 p-3 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (lock.current) return
        const values = new FormData(e.currentTarget)
        lock.current = true
        setBusy(true)
        setError('')
        try {
          await save({
            date: String(values.get('depositDate')),
            amountCents: bankDecimalCents(String(values.get('receivedNet'))),
          })
        } catch (err) {
          setError(errorMessage(err))
        } finally {
          lock.current = false
          setBusy(false)
        }
      }}
    >
      <DateField label="Deposit date" name="depositDate" value={date} required />
      <AmountField label="Net received ($)" name="receivedNet" value={amountCents} required />
      <Button type="submit" variant="primary" disabled={disabled || busy}>
        {busy ? 'Saving�' : 'Confirm received'}
      </Button>
      <p className="text-xs text-slate-400 sm:col-span-3">
        Confirm only when the money has arrived. The printed payday is prefilled; adjust it if
        needed.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-300 sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  )
}
