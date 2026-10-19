import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { formatMoney } from '../../../lib/money'

import { resultAmounts, type ResultAmounts } from '../lib/result-amounts'
export function ProfitLossFields({
  value,
  onChange,
  label = '',
  required = true,
}: {
  value: ResultAmounts
  onChange: (value: ResultAmounts) => void
  label?: string
  required?: boolean
}) {
  let net = 'Enter all amounts, including zero'
  try {
    const amounts = resultAmounts(value)
    net = `Net result: ${formatMoney(amounts.grossCents - amounts.feesCents)}`
  } catch {
    /* Incomplete amounts remain editable. */
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {(['profit', 'loss', 'fees'] as const).map((key) => (
          <FormField
            key={key}
            label={`${label}${{ profit: 'Profit', loss: 'Loss', fees: 'Fees' }[key]} ($)`}
          >
            <Input
              inputMode="decimal"
              required={required}
              value={value[key]}
              placeholder="0.00"
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          </FormField>
        ))}
      </div>
      <p className="text-sm text-slate-300" aria-live="polite">
        {net}
      </p>
    </div>
  )
}
