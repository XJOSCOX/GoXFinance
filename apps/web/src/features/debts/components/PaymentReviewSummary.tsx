import { paymentMethodLabels } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'

export function PaymentReviewSummary({ values }: { values: Record<string, unknown> }) {
  const money = (key: string) =>
    typeof values[key] === 'number' ? formatMoney(values[key]) : 'Unknown'
  const method =
    typeof values.paymentMethod === 'string' && values.paymentMethod in paymentMethodLabels
      ? paymentMethodLabels[values.paymentMethod as keyof typeof paymentMethodLabels]
      : 'Unknown'
  return (
    <section
      aria-label="Payment being reviewed"
      className="my-4 rounded-lg border border-white/10 bg-black/10 p-4"
    >
      <h3 className="text-xs font-semibold text-slate-400">Payment being reviewed</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {[
          ['Amount', money('amountCents')],
          ['Payment date', typeof values.paymentDate === 'string' ? values.paymentDate : 'Unknown'],
          ['Method', method],
          ['Principal', money('principalAmountCents')],
          ['Interest', money('interestAmountCents')],
          ['Fees', money('feesAmountCents')],
          [
            'Reference',
            typeof values.referenceNumber === 'string' ? values.referenceNumber : 'None',
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-400">{label}</dt>
            <dd className="mt-1 break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
