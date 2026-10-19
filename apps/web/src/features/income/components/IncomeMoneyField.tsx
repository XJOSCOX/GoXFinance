import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
export function IncomeMoneyField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <Input
        inputMode="decimal"
        placeholder="Unknown"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  )
}
