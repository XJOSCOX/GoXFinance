import { FormField } from '../ui/FormField'
import { Input } from '../ui'
import { moneyText } from '../../lib/financial-entry'
export function AmountField({
  label,
  name,
  value,
  required = false,
  onChange,
}: {
  label: string
  name: string
  value?: number | null
  required?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <Input
        name={name}
        inputMode="decimal"
        defaultValue={moneyText(value)}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
        placeholder={required ? '0.00' : 'Unknown'}
      />
    </FormField>
  )
}
export function DateField({
  label,
  name,
  value,
  required = false,
  onChange,
}: {
  label: string
  name: string
  value?: string | null
  required?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <Input
        type="date"
        name={name}
        defaultValue={value ?? ''}
        required={required}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </FormField>
  )
}
