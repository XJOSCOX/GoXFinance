import type { IncomeTransactionInput } from '@goxfinance/shared'
import { FormSection } from '../../../components/ui/FormSection'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { parseMoney } from '../../../lib/payment-money'
import { IncomeMoneyField } from './IncomeMoneyField'
import type { IncomeMoney, IncomeUpdater } from './income-form-values'
export function IncomeReceiptFields({
  value,
  update,
  money,
  setMoney,
  trading,
}: {
  value: IncomeTransactionInput
  update: IncomeUpdater
  money: IncomeMoney
  setMoney: (v: IncomeMoney) => void
  trading: boolean
}) {
  let net: number | null = null
  try {
    net = parseMoney(money.actualNetCents)
  } catch {
    /* Validated on submit. */
  }
  return (
    <FormSection
      title="Actual receipt"
      description="Only a confirmed net deposit counts as income received."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <IncomeMoneyField
          label="Actual gross pay ($)"
          value={money.actualGrossCents}
          onChange={(v) => setMoney({ ...money, actualGrossCents: v })}
        />
        <IncomeMoneyField
          label="Deductions ($)"
          value={money.deductionsCents}
          onChange={(v) => setMoney({ ...money, deductionsCents: v })}
        />
        <IncomeMoneyField
          label="Actual net deposited ($)"
          value={money.actualNetCents}
          onChange={(v) => setMoney({ ...money, actualNetCents: v })}
        />
        <FormField label="Deposit date">
          <Input
            type="date"
            required={value.status === 'confirmed'}
            value={value.depositDate ?? ''}
            onChange={(e) => update('depositDate', e.target.value || null)}
          />
        </FormField>
      </div>
      {trading && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-[#b1beb0]"
            checked={value.tradingPayoutWithdrawn}
            onChange={(e) => update('tradingPayoutWithdrawn', e.target.checked)}
          />
          This payout was actually withdrawn and received. Account size and unrealized profits are
          excluded.
        </label>
      )}
      {value.status === 'confirmed' && (
        <div className="rounded-lg border border-[#b1beb0]/30 bg-[#b1beb0]/5 p-4">
          <p className="mb-3 text-sm">
            Confirm receipt of <strong>{formatMoney(net)}</strong>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              required
              type="checkbox"
              className="mt-1 accent-[#b1beb0]"
              checked={value.receiptConfirmed}
              onChange={(e) => update('receiptConfirmed', e.target.checked)}
            />
            I confirm this net amount was deposited on the date entered.
          </label>
        </div>
      )}
    </FormSection>
  )
}
