import {
  payrollFrequencyLabels,
  payrollPeriodCandidates,
  type PayrollFrequency,
  type PayrollStatement,
  type PayrollUploadSource,
} from '@goxfinance/shared'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
export function PayrollPeriodChoice({
  frequency,
  change,
  split,
  setSplit,
  statement,
  source,
}: {
  frequency: PayrollFrequency | ''
  change: (v: PayrollFrequency | '') => void
  split: number
  setSplit: (v: number) => void
  statement: PayrollStatement
  source?: PayrollUploadSource
}) {
  const candidates = payrollPeriodCandidates(statement.periodStart, statement.periodEnd),
    known = source?.profile?.payFrequency ?? source?.frequency
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <FormField label="Pay period schedule">
        <Select
          required
          value={frequency}
          onChange={(e) => change(e.target.value as PayrollFrequency | '')}
        >
          <option value="">Confirm the schedule</option>
          {Object.entries(payrollFrequencyLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
      {frequency === 'semimonthly' && (
        <FormField label="First period ends on calendar day">
          <Input
            type="number"
            min="1"
            max="27"
            value={split}
            required
            onChange={(e) => setSplit(Number(e.target.value))}
          />
        </FormField>
      )}
      <p className="text-xs text-slate-400">
        {candidates.length > 1
          ? 'These dates fit more than one schedule. Confirm every two weeks versus twice monthly.'
          : frequency
            ? 'Schedule suggested from the document dates and saved source; confirm before saving.'
            : 'The schedule is unclear. Choose it after checking your statement.'}{' '}
        Every two weeks means 14 days. Twice monthly follows calendar boundaries.
      </p>
      {known && frequency && known !== frequency && (
        <p className="text-xs text-amber-200">
          This period differs from the saved {payrollFrequencyLabels[known].toLowerCase()} source
          schedule. Your selection applies to this paycheck; older periods remain unchanged. Edit
          payroll settings separately to change future defaults.
        </p>
      )}
    </div>
  )
}
