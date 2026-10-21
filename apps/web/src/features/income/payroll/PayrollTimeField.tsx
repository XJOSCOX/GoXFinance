import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { payrollTimeParts, type SavedPayrollTime } from './payroll-time-entry'
export function PayrollTimeField({
  label,
  name,
  saved,
  required = false,
  zero = false,
}: {
  label: string
  name: string
  saved?: SavedPayrollTime
  required?: boolean
  zero?: boolean
}) {
  const initial = payrollTimeParts(saved),
    legacy =
      saved?.hundredths != null && saved.minutes === undefined && (saved.hundredths * 3) % 5 !== 0
  return (
    <fieldset className="min-w-0 rounded-xl border border-white/8 p-3">
      <legend className="px-1 text-sm font-medium text-slate-300">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Hours">
          <Input
            aria-label={`${label} hours`}
            type="number"
            inputMode="numeric"
            min="0"
            max="8784"
            step="1"
            name={name + 'Hours'}
            placeholder="38"
            defaultValue={initial.hours || (zero ? '0' : '')}
            required={required}
          />
        </FormField>
        <FormField label="Minutes">
          <Input
            aria-label={`${label} minutes`}
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            step="1"
            name={name + 'Minutes'}
            placeholder="0–59"
            defaultValue={initial.minutes || '0'}
          />
        </FormField>
      </div>
      {legacy && (
        <p className="mt-2 text-[11px] text-slate-500">
          Original {(saved!.hundredths! / 100).toFixed(2)} decimal hours retained unless you change
          this time. Minutes shown rounded.
        </p>
      )}
    </fieldset>
  )
}
