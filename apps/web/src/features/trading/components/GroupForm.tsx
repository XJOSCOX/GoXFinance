import { useState } from 'react'
import { copyGroupSchema, type CopyGroup, type TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { text } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { AccountSelectionToolbar } from './AccountSelectionToolbar'
export function GroupForm({
  group,
  accounts,
  save,
  close,
}: {
  group?: CopyGroup
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [selected, setSelected] = useState(group?.members.map((m) => m.accountId) ?? [])
  return (
    <FinancialEditor
      title={group ? 'Edit copy group' : 'Create copy group'}
      record={group}
      save={save}
      close={close}
      build={(data) =>
        copyGroupSchema.parse({
          name: text(data, 'name'),
          leadAccountId: text(data, 'leadAccountId'),
          status: text(data, 'status'),
          members: selected.map((accountId) => ({
            accountId,
            quantityMultiplier: text(data, 'multiplier:' + accountId),
          })),
        })
      }
    >
      <FormField label="Group name">
        <Input name="name" defaultValue={group?.name} required />
      </FormField>
      <div className="space-y-3">
        <AccountSelectionToolbar accounts={accounts} selected={selected} onChange={setSelected} />
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(account.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, account.id]
                      : selected.filter((id) => id !== account.id),
                  )
                }
              />
              {account.nickname}
            </label>
            {selected.includes(account.id) && (
              <FormField label="Quantity multiplier">
                <Input
                  name={'multiplier:' + account.id}
                  defaultValue={
                    group?.members.find((m) => m.accountId === account.id)?.quantityMultiplier ??
                    '1'
                  }
                  required
                  inputMode="decimal"
                  className="max-w-32"
                />
              </FormField>
            )}
          </div>
        ))}
      </div>
      <FormField label="Lead account">
        <Select name="leadAccountId" defaultValue={group?.leadAccountId} required>
          <option value="">Select lead</option>
          {accounts
            .filter((a) => selected.includes(a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
        </Select>
      </FormField>
      <FormField label="Group status">
        <Select name="status" defaultValue={group?.status ?? 'active'}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </FormField>
      <p className="text-xs text-slate-400">
        Multipliers describe the setup only. Every account result must be entered explicitly. Past
        events keep their membership snapshots. Track copying only where the provider permits it.
      </p>
    </FinancialEditor>
  )
}
