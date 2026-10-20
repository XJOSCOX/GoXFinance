import { useState } from 'react'
import type { ExpenseCategory } from '@goxfinance/shared'
import { Button, Input } from '../../../../components/ui'
import { FormField, Select } from '../../../../components/ui/FormField'
export function AllocationFields({
  categories,
  amount,
  initial,
}: {
  categories: ExpenseCategory[]
  amount: number
  initial?: { categoryId: string; amountCents: number }[]
}) {
  const [rows, setRows] = useState(
    initial?.map((r) => ({ ...r, key: crypto.randomUUID() })) ?? [
      { key: crypto.randomUUID(), categoryId: '', amountCents: amount },
    ],
  )
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Category allocation</legend>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <FormField label="Category">
                <Select name="categoryId" required defaultValue={r.categoryId}>
                  <option value="">Choose category</option>
                  {categories
                    .filter((c) => !c.archived || c.id === r.categoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </FormField>
            </div>
            <div className="w-32">
              <FormField label="Amount">
                <Input
                  name="allocation"
                  inputMode="decimal"
                  required
                  defaultValue={(r.amountCents / 100).toFixed(2)}
                />
              </FormField>
            </div>
            {rows.length > 1 && (
              <Button
                type="button"
                size="small"
                onClick={() => setRows(rows.filter((v) => v.key !== r.key))}
              >
                Remove split
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="small"
        className="mt-2"
        disabled={rows.length >= 30}
        onClick={() =>
          setRows([...rows, { key: crypto.randomUUID(), categoryId: '', amountCents: 0 }])
        }
      >
        Split category
      </Button>
      <p className="mt-2 text-xs text-slate-400">
        Allocations must equal the actual transaction amount.
      </p>
    </fieldset>
  )
}
