import type { TradingAccount } from '@goxfinance/shared'
import { FormField, Select } from '../../../components/ui/FormField'
export function TradingAccountSelect({
  accounts,
  value,
  onChange,
  name = 'accountId',
}: {
  accounts: TradingAccount[]
  value?: string
  onChange?: (id: string) => void
  name?: string
}) {
  return (
    <FormField label="Trading account">
      <Select name={name} required value={value} onChange={(e) => onChange?.(e.target.value)}>
        <option value="">Select an account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nickname} / {a.stage.toUpperCase()}
          </option>
        ))}
      </Select>
    </FormField>
  )
}
