import {
  goalContributionSchema,
  localBillDate,
  type Goal,
  type GoalContribution,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { readMoney, text } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
export function ContributionForm({
  goal,
  entry,
  save,
  close,
}: {
  goal: Goal
  entry?: GoalContribution
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  return (
    <FinancialEditor
      title={entry ? 'Correct contribution' : 'Record contribution'}
      record={entry}
      save={save}
      close={close}
      build={(data) =>
        goalContributionSchema.parse({
          goalId: goal.id,
          amountCents: readMoney(data, 'amountCents', true),
          date: text(data, 'date'),
          notes: text(data, 'notes'),
        })
      }
    >
      <p className="text-sm">{goal.name}</p>
      <AmountField
        name="amountCents"
        label="Contribution / adjustment ($)"
        value={entry?.amountCents}
        required
      />
      <p className="text-xs text-slate-400">
        Use a negative adjustment for a withdrawal. Correct an erroneous contribution to zero with
        an explanation. This does not move money or establish a bank balance.
      </p>
      <DateField
        name="date"
        label="Contribution date"
        value={entry?.date ?? localBillDate()}
        required
      />
      <FormField label="Contribution notes">
        <Input name="notes" defaultValue={entry?.notes} required />
      </FormField>
    </FinancialEditor>
  )
}
