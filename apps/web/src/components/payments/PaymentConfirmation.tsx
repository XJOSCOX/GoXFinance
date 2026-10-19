import { formatMoney } from '../../lib/money'
import { parseMoney } from '../../lib/payment-money'
export function PaymentConfirmation({
  amount,
  status,
  confirmed,
  onChange,
}: {
  amount: string
  status: string
  confirmed: boolean
  onChange: (value: boolean) => void
}) {
  let cents: number | null = null
  try {
    cents = parseMoney(amount)
  } catch {
    /* Validation is shown on submit. */
  }
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-sm">
      <p>
        Amount being recorded: <strong>{formatMoney(cents)}</strong>
      </p>
      <p>
        Status: <strong className="capitalize">{status}</strong>
      </p>
      {status === 'completed' ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-1 accent-[#b1beb0]"
          />
          I confirm this payment has actually cleared.
        </label>
      ) : (
        <p className="text-xs text-slate-400">
          Only Completed payments count as money paid. This records information; it does not send a
          payment.
        </p>
      )}
    </div>
  )
}
