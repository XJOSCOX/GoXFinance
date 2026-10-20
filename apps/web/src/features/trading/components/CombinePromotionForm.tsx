import { useState } from 'react'
import { promoteCombineSchema, type TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { text, optionalText, readMoney } from '../../../lib/financial-entry'
import { TradingRuleFields } from './TradingRuleFields'
import { readTradingRule } from '../lib/rule-fields'
export function CombinePromotionForm({
  account,
  save,
  close,
}: {
  account: TradingAccount
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [rules, setRules] = useState(false)
  return (
    <FinancialEditor
      title="Promote Combine to XFA"
      submitLabel="Create linked XFA"
      save={save}
      close={close}
      build={(data) =>
        promoteCombineSchema.parse({
          sourceRevision: account.revision,
          confirmedPassed: data.get('confirmedPassed') === 'on',
          nickname: text(data, 'nickname'),
          maskedExternalId: optionalText(data, 'maskedExternalId'),
          xfaPath: text(data, 'xfaPath'),
          activationDate: optionalText(data, 'activationDate'),
          reportedBalanceCents: readMoney(data, 'reportedBalanceCents'),
          maximumLossCents: readMoney(data, 'maximumLossCents'),
          dailyLossCents: readMoney(data, 'dailyLossCents'),
          notes: optionalText(data, 'notes'),
          ruleSnapshot: rules ? readTradingRule(data) : null,
        })
      }
    >
      <p className="text-sm text-slate-300">
        Keep {account.nickname} and all evaluation history, mark it passed, and create a separate
        linked XFA. Combine profits, balances, fees, results, goals and rule snapshots are not
        transferred.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmedPassed" required />
        Topstep has confirmed this Combine passed and the new XFA is activated.
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="New XFA name">
          <Input
            name="nickname"
            required
            maxLength={120}
            defaultValue={`${account.nickname.slice(0, 116)} XFA`}
          />
        </FormField>
        <FormField label="XFA payout path">
          <Select name="xfaPath" defaultValue="standard">
            <option value="standard">Standard</option>
            <option value="consistency">Consistency</option>
          </Select>
        </FormField>
        <FormField label="New account identifier (last four, optional)">
          <Input name="maskedExternalId" maxLength={16} />
        </FormField>
        <DateField label="XFA activation date (optional)" name="activationDate" />
        <AmountField
          label="Starting XFA tracking balance ($, not cash)"
          name="reportedBalanceCents"
          value={account.tierCents}
        />
        <AmountField label="XFA maximum loss limit ($, optional)" name="maximumLossCents" />
        <AmountField label="XFA daily loss limit ($, optional)" name="dailyLossCents" />
      </div>
      <p className="text-xs text-slate-500">
        The tracking balance starts at the nominal tier (for example, $50,000 for a 50K account).
        This display baseline is not cash or transferred Combine profit, and is separate from the
        provider's funded profit balance. You may enter zero or another confirmed tracking value.
        Other blank figures remain unknown; only actual payout deposits can become income.
      </p>
      <FormField label="Promotion notes">
        <Input name="notes" maxLength={4000} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} />
        Enter reviewed XFA payout rules now
      </label>
      {rules && <TradingRuleFields />}
    </FinancialEditor>
  )
}
