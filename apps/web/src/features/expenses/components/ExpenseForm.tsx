import { useRef, useState } from 'react'
import {
  expenseInputSchema,
  localBillDate,
  paymentMethodLabels,
  type Debt,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, MoneyField, Select } from '../../../components/ui/FormField'
import { FormSection } from '../../../components/ui/FormSection'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'

export function ExpenseForm({
  expense,
  members,
  categories,
  debts,
  close,
  save,
}: {
  expense?: Expense
  members: HouseholdMember[]
  categories: ExpenseCategory[]
  debts: Debt[]
  close: () => void
  save: (input: ExpenseInput, key: string) => Promise<void>
}) {
  const key = useRef(crypto.randomUUID())
  const [value, setValue] = useState<ExpenseInput>(() =>
    expense
      ? expenseInputSchema.parse(
          Object.fromEntries(
            Object.keys(expenseInputSchema.shape).map((key) => [
              key,
              expense[key as keyof Expense],
            ]),
          ),
        )
      : {
          description: '',
          merchant: null,
          responsibleMemberId: members[0]?.id ?? '',
          amountCents: 0,
          transactionDate: localBillDate(),
          paymentMethod: 'debit_card',
          linkedDebtId: null,
          notes: null,
          allocations: [
            {
              categoryId: categories.find((item) => item.name === 'Other')?.id ?? '',
              amountCents: 0,
            },
          ],
        },
  )
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  function update<K extends keyof ExpenseInput>(field: K, input: ExpenseInput[K]) {
    setValue((current) => ({ ...current, [field]: input }))
  }
  return (
    <Modal
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={close}
      description="Record an everyday purchase and how it was paid."
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          try {
            await save(expenseInputSchema.parse(value), key.current)
            close()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="dialog-scroll min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
          <FormSection title="Purchase details">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Description">
                <Input
                  required
                  maxLength={240}
                  value={value.description}
                  onChange={(e) => update('description', e.target.value)}
                />
              </FormField>
              <FormField label="Merchant (optional)">
                <Input
                  value={value.merchant ?? ''}
                  onChange={(e) => update('merchant', e.target.value || null)}
                />
              </FormField>
              <MoneyField
                label="Total amount ($)"
                required
                value={value.amountCents || null}
                onChange={(amount) =>
                  setValue((current) => ({
                    ...current,
                    amountCents: amount ?? 0,
                    allocations:
                      current.allocations.length === 1
                        ? [{ ...current.allocations[0], amountCents: amount ?? 0 }]
                        : current.allocations,
                  }))
                }
              />
              <FormField label="Transaction date">
                <Input
                  required
                  type="date"
                  value={value.transactionDate}
                  onChange={(e) => update('transactionDate', e.target.value)}
                />
              </FormField>
              <FormField label="Responsible member">
                <Select
                  required
                  value={value.responsibleMemberId}
                  onChange={(e) => update('responsibleMemberId', e.target.value)}
                >
                  {members
                    .filter(
                      (item) =>
                        item.status === 'active' || expense?.responsibleMemberId === item.id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                        {item.status !== 'active' ? ' (inactive)' : ''}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField label="Payment method">
                <Select
                  value={value.paymentMethod}
                  onChange={(e) =>
                    setValue((current) => ({
                      ...current,
                      paymentMethod: e.target.value as ExpenseInput['paymentMethod'],
                      linkedDebtId: null,
                    }))
                  }
                >
                  {Object.entries(paymentMethodLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              {value.paymentMethod === 'credit_card' && (
                <FormField label="Tracked credit card (optional)">
                  <Select
                    value={value.linkedDebtId ?? ''}
                    onChange={(e) => update('linkedDebtId', e.target.value || null)}
                  >
                    <option value="">Untracked card</option>
                    {debts
                      .filter((item) => item.accountType === 'credit_card' && !item.isArchived)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.creditorName}
                        </option>
                      ))}
                  </Select>
                </FormField>
              )}
            </div>
          </FormSection>
          <fieldset className="border-t border-white/[.08] pt-5">
            <legend className="mb-3 font-medium">Category allocations</legend>
            <div className="space-y-3">
              {value.allocations.map((allocation, index) => (
                <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <FormField label={`Category ${index + 1}`}>
                    <Select
                      required
                      value={allocation.categoryId}
                      onChange={(e) =>
                        update(
                          'allocations',
                          value.allocations.map((item, i) =>
                            i === index ? { ...item, categoryId: e.target.value } : item,
                          ),
                        )
                      }
                    >
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <MoneyField
                    label="Allocated amount ($)"
                    required
                    value={allocation.amountCents || null}
                    onChange={(amount) =>
                      update(
                        'allocations',
                        value.allocations.map((item, i) =>
                          i === index ? { ...item, amountCents: amount ?? 0 } : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    disabled={value.allocations.length === 1}
                    onClick={() =>
                      update(
                        'allocations',
                        value.allocations.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              type="button"
              size="small"
              disabled={value.allocations.length >= categories.length}
              onClick={() =>
                update('allocations', [
                  ...value.allocations,
                  {
                    categoryId: categories.find(
                      (category) =>
                        !value.allocations.some((item) => item.categoryId === category.id),
                    )!.id,
                    amountCents: 0,
                  },
                ])
              }
            >
              Split another category
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Allocations must equal the total. Credit-card purchases count as spending; repayments
              do not count as a second purchase.
            </p>
          </fieldset>
          <FormSection title="Notes" collapsible>
            <FormField label="Notes">
              <Input
                value={value.notes ?? ''}
                onChange={(e) => update('notes', e.target.value || null)}
              />
            </FormField>
          </FormSection>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-6">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save expense'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
