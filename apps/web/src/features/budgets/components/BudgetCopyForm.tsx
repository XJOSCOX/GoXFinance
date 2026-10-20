import { budgetCopySchema, type BudgetReport, previousBudgetMonth } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { FormField, Select } from '../../../components/ui/FormField'
export function BudgetCopyForm({
  data,
  save,
  close,
}: {
  data: BudgetReport
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const sources = data.records.filter(
      (r) => r.month !== data.month && r.responsibleMemberId === data.responsibleMemberId,
    ),
    previous = sources.find((r) => r.month === previousBudgetMonth(data.month))
  return (
    <FinancialEditor
      title="Copy monthly budget"
      save={save}
      close={close}
      submitLabel="Copy budget"
      build={(f) => {
        const source = sources.find((r) => r.id === String(f.get('sourceId')))
        return budgetCopySchema.parse({
          sourceId: source?.id,
          sourceRevision: source?.revision,
          month: data.month,
        })
      }}
    >
      <p className="text-sm text-slate-400">
        Use a previous month as a template for {data.month}. Limits and notes are copied
        independently; spending and payments are never copied.
      </p>
      <FormField label="Budget template / source month">
        <Select name="sourceId" defaultValue={previous?.id ?? ''} required>
          <option value="">Select a saved month</option>
          {sources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.month}
              {r.status === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
      </FormField>
      {!sources.length && <p>No saved months for this member scope yet.</p>}
    </FinancialEditor>
  )
}
