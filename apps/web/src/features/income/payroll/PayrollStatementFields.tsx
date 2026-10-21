import type { PayrollStatement } from '@goxfinance/shared'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
export function PayrollStatementFields({ initial: s }: { initial: PayrollStatement }) {
  return (
    <details
      open={
        !s.periodStart ||
        !s.periodEnd ||
        !s.payDate ||
        s.grossCents === null ||
        s.netCents === null ||
        s.deductionsCents === null
      }
    >
      <summary className="cursor-pointer text-sm font-medium">
        Correct dates, employer or statement totals
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <FormField label="Pay basis">
          <Select name="payBasis" defaultValue={s.payBasis ?? ''}>
            <option value="">Not specified</option>
            <option value="salary">Salary</option>
            <option value="hourly">Hourly</option>
          </Select>
        </FormField>
        <FormField label="Employer">
          <Input
            placeholder="Employer name on the paycheck"
            name="employer"
            maxLength={160}
            defaultValue={s.employer ?? ''}
          />
        </FormField>
        <FormField label="Assignment / client">
          <Input
            placeholder="Client or work assignment (optional)"
            name="assignment"
            maxLength={160}
            defaultValue={s.assignment ?? ''}
          />
        </FormField>
        <DateField label="Pay period begins" name="periodStart" value={s.periodStart} required />
        <DateField label="Pay period ends" name="periodEnd" value={s.periodEnd} required />
        <DateField label="Statement pay date" name="payDate" value={s.payDate} required />
        <AmountField label="Statement gross ($)" name="gross" value={s.grossCents} required />
        <AmountField
          label="Total employee deductions ($)"
          name="deductions"
          value={s.deductionsCents}
          required
        />
        <AmountField label="Documented net pay ($)" name="net" value={s.netCents} required />
      </div>
    </details>
  )
}
