import { useState } from 'react'
import { tradingAccountSchema, type TradingAccount, type HouseholdMember } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { text, optionalText, readMoney } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
export function AccountForm({
  account,
  members,
  save,
  close,
}: {
  account?: TradingAccount
  members: HouseholdMember[]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [stage, setStage] = useState(account?.stage ?? 'combine'),
    [rules, setRules] = useState(false)
  return (
    <FinancialEditor
      title={account ? 'Edit Topstep account' : 'Add Topstep account'}
      record={account}
      save={save}
      close={close}
      build={(data) =>
        tradingAccountSchema.parse({
          responsibleMemberId: text(data, 'responsibleMemberId'),
          provider: 'Topstep',
          nickname: text(data, 'nickname'),
          maskedExternalId: optionalText(data, 'maskedExternalId'),
          stage,
          xfaPath: stage === 'xfa' ? text(data, 'xfaPath') : 'not_applicable',
          tierCents: readMoney(data, 'tierCents'),
          reportedBalanceCents: readMoney(data, 'reportedBalanceCents'),
          maximumLossCents: readMoney(data, 'maximumLossCents'),
          dailyLossCents: readMoney(data, 'dailyLossCents'),
          activationDate: optionalText(data, 'activationDate'),
          status: text(data, 'status'),
          timezone: text(data, 'timezone'),
          sessionStart: text(data, 'sessionStart'),
          notes: optionalText(data, 'notes'),
          ruleSnapshot: rules
            ? {
                label: text(data, 'ruleLabel'),
                effectiveDate: text(data, 'ruleDate'),
                minimumDays:
                  optionalText(data, 'ruleDays') === null ? null : Number(text(data, 'ruleDays')),
                minimumNetCents: readMoney(data, 'ruleNet'),
                maximumPayoutCents: readMoney(data, 'ruleMaximum'),
                profitShareBps:
                  optionalText(data, 'ruleShare') === null
                    ? null
                    : Number(text(data, 'ruleShare')) * 100,
                notes: optionalText(data, 'ruleNotes'),
              }
            : null,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nickname">
          <Input name="nickname" defaultValue={account?.nickname} required maxLength={120} />
        </FormField>
        <FormField label="Responsible member">
          <Select name="responsibleMemberId" defaultValue={account?.responsibleMemberId} required>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Account stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
            <option value="combine">Trading Combine</option>
            <option value="xfa">XFA</option>
            <option value="lfa">LFA</option>
          </Select>
        </FormField>
        {stage === 'xfa' && (
          <FormField label="XFA path">
            <Select
              name="xfaPath"
              defaultValue={account?.xfaPath === 'not_applicable' ? 'standard' : account?.xfaPath}
            >
              <option value="standard">Standard</option>
              <option value="consistency">Consistency</option>
            </Select>
          </FormField>
        )}
        <FormField label="External identifier (last four only)">
          <Input
            name="maskedExternalId"
            defaultValue={account?.maskedExternalId ?? ''}
            maxLength={12}
          />
        </FormField>
        <AmountField name="tierCents" label="Nominal account tier ($)" value={account?.tierCents} />
        <AmountField
          name="reportedBalanceCents"
          label="Reported trading balance ($)"
          value={account?.reportedBalanceCents}
        />
        <AmountField
          name="maximumLossCents"
          label="Maximum loss limit ($)"
          value={account?.maximumLossCents}
        />
        <AmountField
          name="dailyLossCents"
          label="Daily loss limit ($)"
          value={account?.dailyLossCents}
        />
        <DateField name="activationDate" label="Activation date" value={account?.activationDate} />
        <FormField label="Status">
          <Select name="status" defaultValue={account?.status ?? 'active'}>
            {['active', 'passed', 'failed', 'closed', 'paused'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Trading timezone (IANA)">
          <Input
            name="timezone"
            defaultValue={account?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
            required
            placeholder="America/Chicago"
          />
        </FormField>
        <FormField label="Session starts at (in trading timezone)">
          <Input
            type="time"
            name="sessionStart"
            defaultValue={account?.sessionStart ?? ''}
            required
          />
        </FormField>
      </div>
      <p className="text-xs text-slate-400">
        Session dates use the local date when the session starts. Enter the boundary you use; no
        official provider boundary is assumed. Nominal tiers and simulated balances are not
        household cash.
      </p>
      <FormField label="Notes">
        <Input name="notes" defaultValue={account?.notes ?? ''} maxLength={4000} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} />
        Add a payout-rule snapshot (advisory only)
      </label>
      {rules && (
        <div className="grid gap-4 rounded-xl border border-white/10 p-4 sm:grid-cols-2">
          <FormField label="Rule label">
            <Input name="ruleLabel" required />
          </FormField>
          <DateField name="ruleDate" label="Effective date" required />
          <FormField label="Minimum trading days">
            <Input type="number" name="ruleDays" min="0" />
          </FormField>
          <AmountField name="ruleNet" label="Minimum net profit ($)" />
          <AmountField name="ruleMaximum" label="Maximum payout ($)" />
          <FormField label="Profit share (%)">
            <Input name="ruleShare" type="number" min="0" max="100" step="0.01" />
          </FormField>
          <FormField label="Rule notes / source">
            <Input name="ruleNotes" />
          </FormField>
        </div>
      )}
    </FinancialEditor>
  )
}
