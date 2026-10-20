import { useState } from 'react'
import { budgetSchema, type Budget, type BudgetReport } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { Input, Button } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, optionalText, text } from '../../../lib/financial-entry'
import { moneyText } from '../../../lib/financial-entry'
export function BudgetForm({
  record,
  data,
  save,
  close,
}: {
  record?: Budget
  data: BudgetReport
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [limits, setLimits] = useState(
    record?.limits.map((l) => ({ ...l, value: moneyText(l.amountCents) })) ?? [],
  )
  return (
    <FinancialEditor
      title={record ? 'Edit monthly budget' : 'Create monthly budget'}
      record={record}
      save={save}
      close={close}
      submitLabel="Save budget"
      build={(form) =>
        budgetSchema.parse({
          month: data.month,
          responsibleMemberId: data.responsibleMemberId,
          totalCents: readMoney(form, 'totalCents', true),
          notes: optionalText(form, 'notes'),
          status: text(form, 'status'),
          limits: limits.map((l) => ({
            categoryId: l.categoryId,
            amountCents: readMoney(form, 'limit:' + l.categoryId, true),
          })),
        })
      }
    >
      <p className="text-xs text-slate-400">
        {data.month} ·{' '}
        {data.responsibleMemberId
          ? data.members.find((m) => m.id === data.responsibleMemberId)?.fullName
          : 'Whole household'}{' '}
        · Purchase spending limits, not available cash.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          label="Total monthly budget ($)"
          name="totalCents"
          value={record?.totalCents}
          required
        />
        <FormField label="Budget status">
          <Select name="status" defaultValue={record?.status ?? 'active'}>
            <option value="active">Active</option>
            <option value="archived">Archived / removed</option>
          </Select>
        </FormField>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Category limits</h3>
        <FormField label="Add budget category">
          <Select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id && !limits.some((l) => l.categoryId === id))
                setLimits([...limits, { categoryId: id, amountCents: 0, value: '' }])
            }}
          >
            <option value="">Select category</option>
            {data.categories
              .filter((c) => !c.archived && !limits.some((l) => l.categoryId === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </FormField>
        {limits.map((l) => (
          <div key={l.categoryId} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <FormField
                label={`${data.categories.find((c) => c.id === l.categoryId)?.name ?? 'Historical category'}${data.categories.find((c) => c.id === l.categoryId)?.archived ? ' (archived)' : ''} limit ($)`}
              >
                <Input
                  name={'limit:' + l.categoryId}
                  inputMode="decimal"
                  required
                  value={l.value}
                  onChange={(e) =>
                    setLimits(
                      limits.map((r) =>
                        r.categoryId === l.categoryId ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                />
              </FormField>
            </div>
            <Button
              type="button"
              onClick={() => setLimits(limits.filter((r) => r.categoryId !== l.categoryId))}
              aria-label={
                'Remove ' + (data.categories.find((c) => c.id === l.categoryId)?.name ?? 'category')
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <p className="text-xs text-slate-500">
          Category limits must fit within the total. The unallocated remainder can cover other
          spending. Removing a limit preserves transaction and budget audit history.
        </p>
      </section>
      <FormField label="Notes">
        <Input name="notes" defaultValue={record?.notes ?? ''} />
      </FormField>
    </FinancialEditor>
  )
}
