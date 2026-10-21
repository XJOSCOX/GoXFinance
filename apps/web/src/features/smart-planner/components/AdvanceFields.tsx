import type { ForecastSources, PlannerInput } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { AccountField, PaymentLinks } from './PlannerFields'
export function AdvanceFields({
  sources,
  value,
}: {
  sources: ForecastSources
  value?: Extract<PlannerInput, { kind: 'advance' }>
}) {
  return (
    <>
      <p className="text-sm text-slate-400">
        Link the existing debt liability first. Advance cash is borrowed or accelerated money, never
        another salary deposit.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Provider">
          <Input
            name="provider"
            required
            defaultValue={value?.provider}
            placeholder="Provider or employer name"
          />
        </FormField>
        <FormField label="Advance type">
          <Select name="advanceType" defaultValue={value?.advanceType ?? 'loan'}>
            {['loan', 'earned_wage', 'employer'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <AmountField
          name="principal"
          label="Principal (USD)"
          value={value?.principalCents}
          required
        />
        <AmountField
          name="received"
          label="Actual cash received (USD)"
          value={value?.receivedCents}
          required
        />
        <DateField name="receivedDate" label="Receipt date" value={value?.receivedDate} required />
        <FormField label="Fee collection">
          <Select name="feeCollection" defaultValue={value?.feeCollection ?? 'repayment'}>
            <option value="repayment">Added to repayment</option>
            <option value="withheld">Withheld from disbursement</option>
          </Select>
        </FormField>
        <AmountField name="fees" label="Fees (USD)" value={value?.feesCents ?? 0} required />
        <AmountField
          name="tips"
          label="Optional tip (USD)"
          value={value?.tipsCents ?? 0}
          required
        />
        <AmountField
          name="expedited"
          label="Expedited transfer cost (USD)"
          value={value?.expeditedCents ?? 0}
          required
        />
        <AmountField
          name="repayment"
          label="Total repayment (USD)"
          value={value?.repaymentCents}
          required
        />
        <DateField
          name="repaymentDate"
          label="Repayment date"
          value={value?.repaymentDate}
          required
        />
        <FormField label="Repayment method">
          <Select name="repaymentMethod" defaultValue={value?.repaymentMethod ?? 'bank_debit'}>
            <option value="bank_debit">Bank debit</option>
            <option value="payroll_deduction">Deducted from payroll</option>
          </Select>
        </FormField>
        <FormField label="Employer / income source">
          <Select name="sourceId" defaultValue={value?.sourceId ?? ''}>
            <option value="">Not payroll linked</option>
            {sources.income.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Payroll period">
          <Select name="payrollWeekId" defaultValue={value?.payrollWeekId ?? ''}>
            <option value="">No period selected</option>
            {sources.payroll?.map((w) => (
              <option key={w.id} value={w.id}>
                {sources.income.sources.find((s) => s.id === w.sourceId)?.name} ·{' '}
                {w.expectedPayDate}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Payroll net treatment">
          <Select name="deductionTreatment" defaultValue={value?.deductionTreatment ?? 'unknown'}>
            <option value="unknown">Needs verification</option>
            <option value="included">Repayment already included in net</option>
            <option value="subtract_forecast">Subtract from pre-deduction forecast once</option>
          </Select>
        </FormField>
        <FormField label="Status">
          <Select name="status" defaultValue={value?.status ?? 'proposed'}>
            {['proposed', 'active', 'completed', 'cancelled'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <AccountField sources={sources} value={value?.accountId} />
      </div>
      <AmountField
        name="payrollRepaid"
        label="Confirmed payroll repayment (USD; reviewed deposit required)"
        value={value?.payrollRepaidCents ?? 0}
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input name="receivedConfirmed" type="checkbox" defaultChecked={value?.received} />I confirm
        this advance was actually received
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="autoDebit" type="checkbox" defaultChecked={value?.autoDebit} />
        Automatic repayment enabled
      </label>
      <PaymentLinks sources={sources} name="payments" values={value?.payments} />
    </>
  )
}
