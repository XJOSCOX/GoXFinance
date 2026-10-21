import type { BillInput, Debt } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { FormSection } from '../../../components/ui/FormSection'
export type BillUpdater = <K extends keyof BillInput>(key: K, value: BillInput[K]) => void
export function BillAdditionalFields({
  value,
  update,
  debts,
}: {
  value: BillInput
  update: BillUpdater
  debts: Debt[]
}) {
  return (
    <FormSection
      title="Additional details"
      description="End date, linked debt, auto-pay and notes"
      collapsible
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {value.kind === 'recurring' && (
          <>
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[#b1beb0]"
          checked={value.autoPay}
          onChange={(e) => update('autoPay', e.target.checked)}
        />
        Auto-pay enabled
      </label>
      <FormField label="Notes">
        <textarea
          placeholder="Add optional details or notes"
          className="min-h-20 w-full resize-y rounded-lg border border-white/12 bg-[#151716] px-3 py-2 text-sm outline-none focus:border-[#a9b8a9]"
          maxLength={4000}
          value={value.notes ?? ''}
          onChange={(e) => update('notes', e.target.value || null)}
        />
      </FormField>
    </FormSection>
  )
}
