import { payrollCodes, type PayrollLine } from '@goxfinance/shared'
import { AmountField } from '../../../components/financial/EntryFields'
import { Input, Button } from '../../../components/ui'
import { Select, FormField } from '../../../components/ui/FormField'
export function PayrollLineFields({
  line,
  prefix,
  remove,
}: {
  line: PayrollLine
  prefix: string
  remove: () => void
}) {
  return (
    <details
      className="rounded-lg border border-white/10 p-3"
      open={line.code === 'unknown' || line.confidence === 'low'}
    >
      <summary className="cursor-pointer text-sm font-medium">
        {line.label}{' '}
        <span className="text-xs text-slate-400">
          · {line.side} · {line.confidence} confidence
        </span>
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FormField label="Original display label">
          <Input name={prefix + 'label'} defaultValue={line.label} required maxLength={160} />
        </FormField>
        <FormField label="Payroll side">
          <Select name={prefix + 'side'} defaultValue={line.side}>
            {['earnings', 'deduction', 'employer_tax', 'informational'].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Component">
          <Select name={prefix + 'code'} defaultValue={line.code}>
            {payrollCodes.map((v) => (
              <option key={v} value={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tax treatment (verify, do not assume)">
          <Select name={prefix + 'treatment'} defaultValue={line.treatment}>
            {['unknown', 'pretax', 'posttax', 'not_applicable'].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </FormField>
        <AmountField
          label="Current-period amount ($)"
          name={prefix + 'currentCents'}
          value={line.currentCents}
        />
        <AmountField
          label="YTD cumulative amount ($)"
          name={prefix + 'ytdCents'}
          value={line.ytdCents}
        />
        <AmountField label="Hourly rate ($)" name={prefix + 'rateCents'} value={line.rateCents} />
        <FormField label="Hours (not money)">
          <Input
            name={prefix + 'hoursHundredths'}
            inputMode="decimal"
            defaultValue={line.hoursHundredths === null ? '' : line.hoursHundredths / 100}
          />
        </FormField>
        <FormField label="Worked / nonworked hours">
          <Select
            name={prefix + 'worked'}
            defaultValue={line.worked === null ? 'unknown' : String(line.worked)}
          >
            <option value="unknown">Unknown / not hours</option>
            <option value="true">Worked</option>
            <option value="false">Paid, nonworked</option>
          </Select>
        </FormField>
        <FormField label="Extraction / review confidence">
          <Select name={prefix + 'confidence'} defaultValue={line.confidence}>
            {['high', 'medium', 'low', 'manual'].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <Button type="button" size="small" className="mt-3" onClick={remove}>
        Remove line from reviewed version
      </Button>
    </details>
  )
}
