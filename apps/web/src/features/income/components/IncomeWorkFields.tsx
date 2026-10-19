import { estimatedHourlyGross, type IncomeTransactionInput } from '@goxfinance/shared'
import { FormSection } from '../../../components/ui/FormSection'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { parseMoney } from '../../../lib/payment-money'
import { IncomeMoneyField } from './IncomeMoneyField'
import type { IncomeMoney, IncomeUpdater } from './income-form-values'
export function IncomeWorkFields({
  value,
  update,
  money,
  setMoney,
}: {
  value: IncomeTransactionInput
  update: IncomeUpdater
  money: IncomeMoney
  setMoney: (v: IncomeMoney) => void
}) {
  let estimate: number | null = null
  try {
    estimate = estimatedHourlyGross(
      parseMoney(money.hourlyRateCents),
      value.regularHours,
      value.overtimeHours,
      value.overtimeMultiplier,
    )
  } catch {
    /* Invalid partial input is validated on submit. */
  }
  return (
    <FormSection
      title="Work period & earnings"
      description="Enter the hours actually worked. The rate is saved with this paycheck."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Work period start">
          <Input
            type="date"
            value={value.workPeriodStart ?? ''}
            onChange={(e) => update('workPeriodStart', e.target.value || null)}
          />
        </FormField>
        <FormField label="Work period end">
          <Input
            type="date"
            value={value.workPeriodEnd ?? ''}
            onChange={(e) => update('workPeriodEnd', e.target.value || null)}
          />
        </FormField>
        <FormField label="Regular hours">
          <Input
            inputMode="decimal"
            placeholder="Not entered"
            value={value.regularHours ?? ''}
            onChange={(e) => update('regularHours', e.target.value || null)}
          />
        </FormField>
        <FormField label="Overtime hours">
          <Input
            inputMode="decimal"
            placeholder="Not entered"
            value={value.overtimeHours ?? ''}
            onChange={(e) => update('overtimeHours', e.target.value || null)}
          />
        </FormField>
        <IncomeMoneyField
          label="Hourly rate for this paycheck ($)"
          value={money.hourlyRateCents}
          onChange={(v) => setMoney({ ...money, hourlyRateCents: v })}
        />
        <FormField label="Overtime multiplier">
          <Input
            inputMode="decimal"
            value={value.overtimeMultiplier}
            onChange={(e) => update('overtimeMultiplier', e.target.value)}
          />
        </FormField>
      </div>
      <p className="rounded-lg border border-white/10 bg-black/15 p-3 text-sm">
        Estimated gross{' '}
        <strong className="float-right tabular-nums">{formatMoney(estimate)}</strong>
      </p>
    </FormSection>
  )
}
