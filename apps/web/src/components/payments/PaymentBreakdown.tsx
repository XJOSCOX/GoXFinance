import { Input } from '../ui'
import { FormField } from '../ui/FormField'
export type PaymentBreakdownText = {
  principal: string
  interest: string
  fees: string
  reference: string
}
export function PaymentBreakdown({
  value,
  onChange,
}: {
  value: PaymentBreakdownText
  onChange: (value: PaymentBreakdownText) => void
}) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <h3 className="text-sm font-medium">Payment breakdown</h3>
      <p className="text-xs text-slate-400">
        Leave unknown portions blank. Only known principal reduces an estimated debt balance.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['principal', 'interest', 'fees'] as const).map((key) => (
          <FormField key={key} label={key[0].toUpperCase() + key.slice(1)}>
            <Input
              inputMode="decimal"
              placeholder="Unknown"
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </FormField>
        ))}
      </div>
      <FormField label="Reference number">
        <Input
          maxLength={120}
          value={value.reference}
          onChange={(e) => onChange({ ...value, reference: e.target.value })}
        />
      </FormField>
    </section>
  )
}
