import { bankBalanceSchema, bankDecimalCents, type BankAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
export function BankBalanceForm({
  account,
  save,
  close,
}: {
  account: BankAccount
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  return (
    <FinancialEditor
      title={'Record balance · ' + account.name}
      save={save}
      close={close}
      submitLabel="Save observation"
      build={(f) => {
        const cents = (name: string) =>
          String(f.get(name) ?? '').trim() ? bankDecimalCents(String(f.get(name))) : null
        return bankBalanceSchema.parse({
          currentCents: cents('current'),
          availableCents: cents('available'),
          observedAt: new Date(String(f.get('observedAt'))).toISOString(),
          notes: String(f.get('notes') || '') || null,
        })
      }}
    >
      <p className="text-sm text-slate-400">
        A dated observation only. This does not create income, spending, an asset valuation or a
        debt balance change.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField label="Current balance" name="current" />
        <AmountField
          label={account.type === 'credit_card' ? 'Available credit' : 'Available balance'}
          name="available"
        />
        <FormField label="Observed at (local time)">
          <Input
            name="observedAt"
            type="datetime-local"
            required
            defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16)}
          />
        </FormField>
        <FormField label="Notes (optional)">
          <Input name="notes" maxLength={500} />
        </FormField>
      </div>
    </FinancialEditor>
  )
}
