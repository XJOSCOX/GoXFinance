import { CategoryPicker } from '../../categories/components/CategoryPicker'
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
import { FormSection } from '../../../components/ui/FormSection'
import { BillAdditionalFields } from './BillAdditionalFields'
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
    <Modal
      title={bill ? 'Edit bill' : 'Add bill'}
      onClose={close}
      description="Set up an obligation. Record payments separately when they happen."
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
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
        <div className="dialog-scroll min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
          <FormSection title="Bill details">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Bill name">
                <Input
                  required
                  maxLength={160}
                  value={value.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </FormField>
              <CategoryPicker
                home={members[0]?.householdId ?? ''}
                value={value.categoryId}
                label={value.category}
                onChange={(id, name) =>
                  setValue((current) => ({ ...current, categoryId: id, category: name }))
                }
              />
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
                  {' '}
                  <FormField label="Frequency">
                    <Select
                      value={value.frequency!}
                      onChange={(e) =>
                        update('frequency', e.target.value as BillInput['frequency'])
                      }
                    >
                      {['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'].map((item) => (
                        <option key={item} value={item}>
                          {item.charAt(0).toUpperCase() + item.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </>
              )}
            </div>
          </FormSection>
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
          <fieldset className="border-t border-white/[.08] pt-5">
            <legend className="mb-3 text-sm font-semibold">Responsible members</legend>
            <div className="flex flex-wrap gap-3">
              {members
                .filter((item) => item.status === 'active' || value.memberIds.includes(item.id))
                .map((member) => (
                  <label
                    key={member.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${value.memberIds.includes(member.id) ? 'border-[#b1beb0]/40 bg-[#b1beb0]/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[#b1beb0]"
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
          <BillAdditionalFields value={value} update={update} debts={debts} />
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
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-6">
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
