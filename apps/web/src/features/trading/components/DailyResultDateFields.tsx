import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import type { TradingResult } from '@goxfinance/shared'
export function DailyResultDateFields({
  reported,
  onChange,
  result,
}: {
  reported: boolean
  onChange: (value: boolean) => void
  result?: TradingResult
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reported} onChange={(e) => onChange(e.target.checked)} />
        Use reported trading day (no execution time)
      </label>
      {reported ? (
        <FormField label="Reported trading day">
          <Input
            name="reportedDate"
            type="date"
            defaultValue={result?.reportedDate ?? ''}
            required
          />
        </FormField>
      ) : (
        <FormField label="Session timestamp (your device time)">
          <Input
            name="sessionAt"
            type="datetime-local"
            required
            defaultValue={
              result
                ? new Date(
                    new Date(result.sessionAt).getTime() -
                      new Date(result.sessionAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ''
            }
          />
        </FormField>
      )}
      {reported && (
        <p className="text-xs text-slate-400">
          Use the day printed on the provider's daily report. The timestamp records entry time, not
          an invented execution time. Session-start keys still prevent duplicate manual or copied
          results.
        </p>
      )}
    </div>
  )
}
