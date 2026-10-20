import { TradingRuleFields } from './TradingRuleFields'
import { readTradingRule } from '../lib/rule-fields'
import { useState } from 'react'
import {
  tradingAccountSchema,
  tradingAccountBatchSchema,
  latestSavedRule,
  type TradingAccount,
  type HouseholdMember,
} from '@goxfinance/shared'
import { AccountIdentities, type AccountIdentity } from './AccountIdentities'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { text, optionalText, readMoney } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
export function AccountForm({
  account,
  template,
  members,
  save,
  close,
}: {
  account?: TradingAccount
  template?: TradingAccount
  members: HouseholdMember[]
  save: (body: unknown, batch?: boolean) => Promise<void>
  close: () => void
}) {
  const defaults =
    account ??
    (template
      ? {
          ...template,
          nickname: '',
          maskedExternalId: null,
          reportedBalanceCents: null,
          activationDate: null,
          status: 'active',
          notes: null,
        }
      : undefined)
  const [count, setCount] = useState(1)
  const [identities, setIdentities] = useState<AccountIdentity[]>([
    { nickname: template ? `${template.nickname.slice(0, 110)} copy` : '', maskedExternalId: '' },
  ])
  const [stage, setStage] = useState(defaults?.stage ?? 'combine'),
    [rules, setRules] = useState(false)
  return (
    <FinancialEditor
      title={
        account ? 'Edit Topstep account' : template ? 'Duplicate account' : 'Add Topstep accounts'
      }
      record={account}
      submitLabel={
        account ? 'Save account' : count === 1 ? 'Create account' : `Create ${count} accounts`
      }
      save={(body) => save(body, !account && count > 1)}
      close={close}
      build={(data) => {
        const values = tradingAccountSchema.parse({
          responsibleMemberId: text(data, 'responsibleMemberId'),
          provider: 'Topstep',
          nickname: account ? text(data, 'nickname') : identities[0].nickname,
          maskedExternalId: account
            ? optionalText(data, 'maskedExternalId')
            : identities[0].maskedExternalId || null,
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
          ruleSnapshot: rules ? readTradingRule(data) : null,
        })
        return !account && count > 1
          ? tradingAccountBatchSchema.parse(
              identities.slice(0, count).map((identity) => ({
                ...values,
                ...identity,
                maskedExternalId: identity.maskedExternalId || null,
              })),
            )
          : values
      }}
    >
      {!account && (
        <AccountIdentities
          rows={identities}
          count={count}
          onCount={(next) => {
            setCount(next)
            setIdentities((rows) =>
              Array.from(
                { length: Math.max(next, rows.length) },
                (_, i) =>
                  rows[i] ?? {
                    nickname: `${(rows[0].nickname || 'Account').slice(0, 110)} ${i + 1}`,
                    maskedExternalId: '',
                  },
              ),
            )
          }}
          onChange={(index, field, value) =>
            setIdentities((rows) =>
              rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
            )
          }
        />
      )}
      {template && (
        <p className="text-xs text-slate-400">
          Setup copied from {template.nickname}. Balances, identifiers, results, payouts and rule
          history are not copied.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {account && (
          <FormField label="Nickname">
            <Input name="nickname" defaultValue={defaults?.nickname} required maxLength={120} />
          </FormField>
        )}
        <FormField label="Responsible member">
          <Select name="responsibleMemberId" defaultValue={defaults?.responsibleMemberId} required>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Account stage">
          <Select
            value={stage}
            disabled={account?.stage === 'combine'}
            onChange={(e) => setStage(e.target.value as typeof stage)}
          >
            <option value="combine">Trading Combine</option>
            <option value="xfa">XFA</option>
            <option value="lfa">LFA</option>
          </Select>
        </FormField>
        {account?.stage === 'combine' && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            Use Promote to XFA on the account card after provider confirmation to keep evaluation
            history separate.
          </p>
        )}
        {stage === 'xfa' && (
          <FormField label="XFA path">
            <Select
              name="xfaPath"
              defaultValue={defaults?.xfaPath === 'not_applicable' ? 'standard' : defaults?.xfaPath}
            >
              <option value="standard">Standard</option>
              <option value="consistency">Consistency</option>
            </Select>
          </FormField>
        )}
        {account && (
          <FormField label="External identifier (last four only)">
            <Input
              name="maskedExternalId"
              defaultValue={defaults?.maskedExternalId ?? ''}
              maxLength={12}
            />
          </FormField>
        )}
        <AmountField
          name="tierCents"
          label="Nominal account tier ($)"
          value={defaults?.tierCents}
        />
        {count === 1 && (
          <AmountField
            name="reportedBalanceCents"
            label="Reported trading balance ($)"
            value={defaults?.reportedBalanceCents}
          />
        )}
        <AmountField
          name="maximumLossCents"
          label="Maximum loss limit ($)"
          value={defaults?.maximumLossCents}
        />
        <AmountField
          name="dailyLossCents"
          label="Daily loss limit ($)"
          value={defaults?.dailyLossCents}
        />
        <DateField
          name="activationDate"
          label={stage === 'combine' ? 'Combine start date' : 'Activation date'}
          value={defaults?.activationDate}
        />
        <FormField label="Status">
          <Select name="status" defaultValue={defaults?.status ?? 'active'}>
            {['active', 'passed', 'failed', 'closed', 'paused'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Trading timezone (IANA)">
          <Input
            name="timezone"
            defaultValue={defaults?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
            required
            placeholder="America/Chicago"
          />
        </FormField>
        <FormField label="Session starts at (in trading timezone)">
          <Input
            type="time"
            name="sessionStart"
            defaultValue={defaults?.sessionStart ?? ''}
            required
          />
        </FormField>
      </div>
      {count > 1 && (
        <p className="text-xs text-slate-400">
          New account balances start unknown. The entered start date applies to every account in
          this batch; no trading results are created.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Session dates use the local date when the session starts. Enter the boundary you use; no
        official provider boundary is assumed. Nominal tiers and simulated balances are not
        household cash.
      </p>
      <FormField label="Notes">
        <Input name="notes" defaultValue={defaults?.notes ?? ''} maxLength={4000} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} />
        Add a payout-rule snapshot (advisory only)
      </label>
      {rules && (
        <TradingRuleFields rule={account ? latestSavedRule(account.ruleSnapshots) : undefined} />
      )}
    </FinancialEditor>
  )
}
