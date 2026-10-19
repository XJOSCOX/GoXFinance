import { useState } from 'react'
import {
  incomeSourceSchema,
  incomeFrequencyLabels,
  incomeTypeLabels,
  type IncomeSource,
  type IncomeSourceInput,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { FormSection } from '../../../components/ui/FormSection'
import { FormField, Select } from '../../../components/ui/FormField'
import { Button, Input } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { IncomeMoneyField } from './IncomeMoneyField'
import { moneyInputs, parseMoneyInputs } from './income-money'
const fields = ['hourlyRateCents', 'expectedGrossCents', 'expectedNetCents'] as const
export function IncomeSourceForm({
  source,
  members,
  close,
  save,
}: {
  source?: IncomeSource
  members: HouseholdMember[]
  close: () => void
  save: (values: IncomeSourceInput, key: string, reason: string) => Promise<void>
}) {
  const [value, setValue] = useState<IncomeSourceInput>(() =>
    source
      ? incomeSourceSchema.parse(
          Object.fromEntries(
            Object.keys(incomeSourceSchema.shape).map((k) => [k, source[k as keyof IncomeSource]]),
          ),
        )
      : {
          name: '',
          responsibleMemberId: members[0]?.id ?? '',
          incomeType: 'hourly',
          frequency: 'weekly',
          hourlyRateCents: null,
          expectedGrossCents: null,
          expectedNetCents: null,
          payday: null,
          overtimeMultiplier: '1',
          status: 'active',
          notes: null,
        },
  )
  const [money, setMoney] = useState(() => moneyInputs(fields, source)),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key] = useState(() => crypto.randomUUID())
  const update = <K extends keyof IncomeSourceInput>(key: K, input: IncomeSourceInput[K]) =>
    setValue((v) => ({ ...v, [key]: input }))
  return (
    <Modal
      title={source ? 'Edit income source' : 'Add income source'}
      description="Expected amounts are estimates, not deposits received."
      onClose={close}
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            await save(
              incomeSourceSchema.parse({ ...value, ...parseMoneyInputs(money) }),
              key,
              reason,
            )
            close()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
          <FormSection title="Source details">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Source / employer name">
                <Input
                  required
                  maxLength={160}
                  value={value.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </FormField>
              <FormField label="Earning member">
                <Select
                  value={value.responsibleMemberId}
                  onChange={(e) => update('responsibleMemberId', e.target.value)}
                >
                  {members.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.fullName}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Income type">
                <Select
                  value={value.incomeType}
                  onChange={(e) =>
                    update('incomeType', e.target.value as IncomeSourceInput['incomeType'])
                  }
                >
                  {Object.entries(incomeTypeLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Pay frequency">
                <Select
                  value={value.frequency}
                  onChange={(e) =>
                    update('frequency', e.target.value as IncomeSourceInput['frequency'])
                  }
                >
                  {Object.entries(incomeFrequencyLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              {value.incomeType === 'hourly' && (
                <>
                  <IncomeMoneyField
                    label="Base hourly rate ($)"
                    value={money.hourlyRateCents}
                    onChange={(v) => setMoney((m) => ({ ...m, hourlyRateCents: v }))}
                  />
                  <FormField label="Overtime multiplier">
                    <Input
                      required
                      inputMode="decimal"
                      value={value.overtimeMultiplier}
                      onChange={(e) => update('overtimeMultiplier', e.target.value)}
                    />
                  </FormField>
                </>
              )}
              <FormField label="Weekly payday (optional)">
                <Select
                  value={value.payday ?? ''}
                  onChange={(e) =>
                    update('payday', e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">Not selected</option>
                  {[
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ].map((v, i) => (
                    <option key={i} value={i}>
                      {v}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Status">
                <Select
                  value={value.status}
                  onChange={(e) => update('status', e.target.value as IncomeSourceInput['status'])}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </FormField>
            </div>
          </FormSection>
          <FormSection
            title="Budget estimates"
            description="Per pay period. No work hours or overtime eligibility are assumed."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <IncomeMoneyField
                label="Expected gross ($)"
                value={money.expectedGrossCents}
                onChange={(v) => setMoney((m) => ({ ...m, expectedGrossCents: v }))}
              />
              <IncomeMoneyField
                label="Expected net ($)"
                value={money.expectedNetCents}
                onChange={(v) => setMoney((m) => ({ ...m, expectedNetCents: v }))}
              />
            </div>
          </FormSection>
          <FormField label="Notes">
            <Input
              value={value.notes ?? ''}
              onChange={(e) => update('notes', e.target.value || null)}
            />
          </FormField>
          {source && (
            <FormField label="Reason for correction">
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          )}
        </div>
        <footer className="shrink-0 border-t border-white/10 px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save source'}
            </Button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
