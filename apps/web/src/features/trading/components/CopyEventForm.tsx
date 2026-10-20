import { useState } from 'react'
import {
  copyEventSchema,
  type CopyGroup,
  type CopyEvent,
  type TradingAccount,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { CopyResultFields } from './CopyResultFields'
import { readCopyAmounts } from '../lib/copy-result-amounts'
import { text, optionalText } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { AccountSelectionToolbar } from './AccountSelectionToolbar'
export function CopyEventForm({
  event,
  groups,
  accounts,
  save,
  close,
}: {
  event?: CopyEvent
  groups: CopyGroup[]
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [groupId, setGroupId] = useState(event?.groupId ?? groups[0]?.id ?? ''),
    group = event?.membershipSnapshot ?? groups.find((g) => g.id === groupId),
    [selected, setSelected] = useState(
      event?.entries.map((e) => e.accountId) ?? group?.members.map((m) => m.accountId) ?? [],
    )
  return (
    <FinancialEditor
      title={event ? 'Correct copied event' : 'Record copied event'}
      record={event}
      save={save}
      close={close}
      build={(data) =>
        copyEventSchema.parse({
          groupId,
          sessionAt: new Date(text(data, 'sessionAt')).toISOString(),
          mode: text(data, 'mode'),
          instrument: optionalText(data, 'instrument'),
          direction: optionalText(data, 'direction'),
          notes: optionalText(data, 'notes'),
          entries: selected.map((accountId) => ({
            accountId,
            quantity: text(data, 'quantity:' + accountId),
            ...readCopyAmounts(data, accountId),
          })),
        })
      }
    >
      {!event && (
        <FormField label="Copy group">
          <Select
            value={groupId}
            required
            onChange={(e) => {
              setGroupId(e.target.value)
              setSelected(
                groups.find((g) => g.id === e.target.value)?.members.map((m) => m.accountId) ?? [],
              )
            }}
          >
            <option value="">Choose group</option>
            {groups
              .filter((g) => g.status === 'active')
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Entry mode">
          <Select name="mode" defaultValue={event?.mode ?? 'trade'}>
            <option value="trade">One copied trade/event</option>
            <option value="daily">Daily copied summary</option>
          </Select>
        </FormField>
        <FormField label="Timestamp (your device time)">
          <Input
            name="sessionAt"
            type="datetime-local"
            required
            defaultValue={
              event
                ? new Date(
                    new Date(event.sessionAt).getTime() -
                      new Date(event.sessionAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ''
            }
          />
        </FormField>
        <FormField label="Instrument (optional)">
          <Input name="instrument" defaultValue={event?.instrument ?? ''} />
        </FormField>
        <FormField label="Direction (optional)">
          <Select name="direction" defaultValue={event?.direction ?? ''}>
            <option value="">Not specified</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </Select>
        </FormField>
      </div>
      <p className="text-xs text-slate-400">
        Enter actual results for each account, including losses or zero. Quantities do not estimate
        confirmed monetary P&amp;L. Daily summaries cannot overlap trade-level or manual results for
        the same session.
      </p>
      {!event && group && (
        <AccountSelectionToolbar
          accounts={group.members.map((m) => ({ id: m.accountId }))}
          selected={selected}
          onChange={setSelected}
        />
      )}
      {group?.members.map((member) => {
        const row = event?.entries.find((e) => e.accountId === member.accountId),
          account = accounts.find((a) => a.id === member.accountId)
        return (
          <section
            key={member.accountId}
            className="space-y-3 rounded-xl border border-white/10 p-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!!event}
                checked={selected.includes(member.accountId)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, member.accountId]
                      : selected.filter((id) => id !== member.accountId),
                  )
                }
              />
              {account?.nickname ?? 'Historical account'}{' '}
              {member.accountId === group.leadAccountId ? '(Lead)' : '(Follower)'}
            </label>
            <p className="text-xs text-slate-500">
              Multiplier {member.quantityMultiplier} / {account?.timezone}, session starts{' '}
              {account?.sessionStart}
            </p>
            {selected.includes(member.accountId) && (
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Actual quantity">
                  <Input
                    name={'quantity:' + member.accountId}
                    defaultValue={row?.quantity ?? ''}
                    required
                    inputMode="decimal"
                  />
                </FormField>
                <div className="sm:col-span-3">
                  <CopyResultFields
                    accountId={member.accountId}
                    nickname={account?.nickname ?? 'Historical account'}
                    row={row}
                  />
                </div>
              </div>
            )}
          </section>
        )
      })}
      <FormField label="Event notes">
        <Input name="notes" defaultValue={event?.notes ?? ''} />
      </FormField>
    </FinancialEditor>
  )
}
