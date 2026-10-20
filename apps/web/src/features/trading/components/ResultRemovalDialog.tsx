import { tradingResultDate } from '@goxfinance/shared'
import type { TradingResult } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { text } from '../../../lib/financial-entry'
export function ResultRemovalDialog({
  result,
  save,
  close,
}: {
  result: TradingResult
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  return (
    <FinancialEditor
      title="Delete daily result"
      submitLabel="Delete result"
      record={result}
      save={save}
      close={close}
      build={(data) => ({ confirmation: text(data, 'confirmation') })}
    >
      <p className="text-sm text-slate-300">
        Remove the result for {tradingResultDate(result)} from performance and goal totals. Its
        previous values and your reason remain in the audit history. This does not cancel payouts or
        deposited income.
      </p>
      <FormField label="Type DELETE to confirm">
        <Input name="confirmation" required pattern="DELETE" autoComplete="off" />
      </FormField>
    </FinancialEditor>
  )
}
