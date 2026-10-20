import { useState } from 'react'
import type { BankReviewOptions } from '@goxfinance/shared'
import { FormField, Select } from '../../../../components/ui/FormField'
import { Input } from '../../../../components/ui'
import { formatMoney } from '../../../../lib/money'
import { AllocationFields } from './AllocationFields'
export function ExpenseReviewFields({ data }: { data: BankReviewOptions }) {
  const [existing, setExisting] = useState(
    data.existingLink?.classification === 'expense' || data.existingLink?.classification === 'fee'
      ? data.existingLink.id
      : '',
  )
  return (
    <>
      <FormField label="Record">
        <Select name="expenseId" value={existing} onChange={(e) => setExisting(e.target.value)}>
          <option value="">Create an explicitly confirmed expense</option>
          {data.expenses
            .filter((e) => !e.voided)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.description} · {formatMoney(e.amountCents)} · {e.transactionDate}
              </option>
            ))}
        </Select>
      </FormField>
      {!existing && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Description">
              <Input
                name="description"
                defaultValue={data.transaction.description.slice(0, 240)}
                required
                maxLength={240}
              />
            </FormField>
            <FormField label="Merchant (optional)">
              <Input
                name="merchant"
                defaultValue={data.transaction.merchant?.slice(0, 160) ?? ''}
                maxLength={160}
              />
            </FormField>
            <FormField label="Responsible member">
              <Select
                name="memberId"
                required
                defaultValue={data.members.length === 1 ? data.members[0].id : ''}
              >
                <option value="">Choose member</option>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Notes (optional)">
              <Input name="notes" maxLength={4000} />
            </FormField>
          </div>
          <AllocationFields
            categories={data.categories}
            amount={Math.abs(data.transaction.amountCents)}
          />
        </>
      )}
    </>
  )
}
