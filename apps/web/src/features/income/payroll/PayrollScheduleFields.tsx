import { useState } from 'react'
import {
  payrollFrequencyLabels,
  type PayrollFrequency,
  type PayrollProfileInput,
} from '@goxfinance/shared'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
export function PayrollScheduleFields({ initial }: { initial: Partial<PayrollProfileInput> }) {
  const [frequency, setFrequency] = useState<PayrollFrequency>(initial.payFrequency ?? 'weekly')
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Pay frequency">
        <Select
          name="payFrequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as PayrollFrequency)}
        >
          {Object.entries(payrollFrequencyLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Known period start (anchor, optional)">
        <Input type="date" name="periodAnchor" defaultValue={initial.periodAnchor ?? ''} />
      </FormField>
      <FormField label="First twice-monthly period ends on day">
        <Input
          type="number"
          name="semiMonthlySplitDay"
          min="1"
          max="27"
          defaultValue={initial.semiMonthlySplitDay ?? 15}
          required
        />
      </FormField>
      <FormField label="Bank deposit: days after period end (optional)">
        <Input
          type="number"
          name="depositOffsetDays"
          min="-31"
          max="60"
          defaultValue={initial.depositOffsetDays ?? ''}
        />
      </FormField>
      <p className="text-xs text-slate-400 sm:col-span-2">
        Every two weeks is a 14-day cycle; twice monthly follows calendar boundaries. For monthly,
        twice-monthly and irregular payroll, a blank deposit offset means the expected bank date
        stays unknown. Printed pay dates and actual deposits remain separate. Weekday milestones
        below apply only to weekly or biweekly schedules.
      </p>
    </div>
  )
}
