import { useState } from 'react'
import {
  billInputSchema,
  localBillDate,
  type BillInput,
  type BillView,
  type Debt,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, MoneyField, Select } from '../../../components/ui/FormField'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'

export function BillForm({
  bill,
  members,
  debts,
  save,
  close,
}: {
  bill?: BillView
  members: HouseholdMember[]
  debts: Debt[]
  save: (input: BillInput, reason: string) => Promise<void>
  close: () => void
}) {
  const [value, setValue] = useState<BillInput>(() =>
    bill
      ? billInputSchema.parse(
          Object.fromEntries(
            Object.keys(billInputSchema.shape).map((key) => [key, bill[key as keyof BillView]]),
          ),
        )
      : {
          name: '',
          category: 'Other',
          kind: 'recurring',
          amountType: 'fixed',
          amountCents: null,
          estimatedAmountCents: null,
          frequency: 'monthly',
          nextDueDate: localBillDate(),
          endDate: null,
          autoPay: false,
          status: 'active',
          notes: null,
          linkedDebtId: null,
          memberIds: [],
        },
  )
  const [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  function update<K extends keyof BillInput>(key: K, input: BillInput[K]) {
    setValue((current) => ({ ...current, [key]: input }))
  }
  return (
    <Modal title={bill ? 'Edit bill' : 'Add bill'} onClose={close} framed className="max-w-2xl">
      <form
        className="flex min-h-0 flex-col"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          try {
            await save(billInputSchema.parse(value), reason)
            close()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="dialog-scroll min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Bill name">
              <Input
                required
                maxLength={160}
                value={value.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </FormField>
            <FormField label="Category">
              <Input
                required
                maxLength={80}
                value={value.category}
                onChange={(e) => update('category', e.target.value)}
              />
            </FormField>
            <FormField label="Bill type">
              <Select
                disabled={!!bill}
                value={value.kind}
                onChange={(e) =>
                  setValue((current) => ({
                    ...current,
                    kind: e.target.value as BillInput['kind'],
                    frequency: e.target.value === 'recurring' ? 'monthly' : null,
                    endDate: null,
                    linkedDebtId: null,
                    status: 'active',
                  }))
                }
              >
                <option value="recurring">Recurring</option>
                <option value="one_time">One-time</option>
              </Select>
            </FormField>
            <FormField label="Amount type">
              <Select
                value={value.amountType}
                onChange={(e) =>
                  setValue((current) => ({
                    ...current,
                    amountType: e.target.value as BillInput['amountType'],
                    amountCents: null,
                    estimatedAmountCents: null,
                  }))
                }
              >
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </Select>
            </FormField>
            {value.amountType === 'fixed' ? (
              <MoneyField
                label="Billed amount ($)"
                value={value.amountCents}
                onChange={(amount) => update('amountCents', amount)}
              />
            ) : (
              <MoneyField
                label="Budget estimate ($)"
                value={value.estimatedAmountCents}
                onChange={(amount) => update('estimatedAmountCents', amount)}
              />
            )}
            <FormField label="First / next due date">
              <Input
                type="date"
                required
                value={value.nextDueDate}
                onChange={(e) => update('nextDueDate', e.target.value)}
              />
            </FormField>
            {value.kind === 'recurring' && (
              <>
                <FormField label="Frequency">
                  <Select
                    value={value.frequency!}
                    onChange={(e) => update('frequency', e.target.value as BillInput['frequency'])}
                  >
                    {['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="End date (optional)">
                  <Input
                    type="date"
                    value={value.endDate ?? ''}
                    onChange={(e) => update('endDate', e.target.value || null)}
                  />
                </FormField>
                <FormField label="Linked debt (optional)">
                  <Select
                    value={value.linkedDebtId ?? ''}
                    onChange={(e) => update('linkedDebtId', e.target.value || null)}
                  >
                    <option value="">No debt link</option>
                    {debts
                      .filter((item) => !item.isArchived)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.creditorName}
                        </option>
                      ))}
                  </Select>
                </FormField>
              </>
            )}
            <FormField label="Status">
              <Select
                value={value.status}
                onChange={(e) => update('status', e.target.value as BillInput['status'])}
              >
                <option value="active">Active</option>
                <option value={value.kind === 'recurring' ? 'inactive' : 'cancelled'}>
                  {value.kind === 'recurring' ? 'Inactive' : 'Cancelled'}
                </option>
              </Select>
            </FormField>
          </div>
          {value.amountType === 'variable' && (
            <p className="text-xs text-slate-400">
              Estimates are for budgeting. Enter each period’s actual bill separately.
            </p>
          )}
          {bill && (
            <p className="text-xs text-slate-400">
              Schedule changes apply to new periods. Existing periods keep their amounts and
              estimates; change an existing actual amount from View bill.
            </p>
          )}
          <fieldset>
            <legend className="mb-3 text-sm">Responsible members</legend>
            <div className="flex flex-wrap gap-3">
              {members
                .filter((item) => item.status === 'active' || value.memberIds.includes(item.id))
                .map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={value.memberIds.includes(member.id)}
                      onChange={(e) =>
                        update(
                          'memberIds',
                          e.target.checked
                            ? [...value.memberIds, member.id]
                            : value.memberIds.filter((id) => id !== member.id),
                        )
                      }
                    />
                    {member.fullName}
                  </label>
                ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.autoPay}
              onChange={(e) => update('autoPay', e.target.checked)}
            />
            Auto-pay enabled
          </label>
          <FormField label="Notes">
            <Input
              value={value.notes ?? ''}
              onChange={(e) => update('notes', e.target.value || null)}
            />
          </FormField>
          {bill?.requiresApproval && (
            <FormField label="Reason for Owner review">
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 p-4">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? 'Saving…' : bill?.requiresApproval ? 'Request change' : 'Save bill'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
