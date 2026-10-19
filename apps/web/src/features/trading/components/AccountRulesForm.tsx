import { useState } from 'react'
import {
  tradingAccountRulesBatchSchema,
  latestSavedRule,
  type TradingAccount,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { FormField } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { readMoney, text } from '../../../lib/financial-entry'
import { AccountSelectionToolbar } from './AccountSelectionToolbar'
import { TradingRuleFields } from './TradingRuleFields'
import { readTradingRule } from '../lib/rule-fields'

export function AccountRulesForm({
  accounts,
  save,
  close,
  selectAll = false,
}: {
  accounts: TradingAccount[]
  save: (body: unknown) => Promise<void>
  close: () => void
  selectAll?: boolean
}) {
  const [selected, setSelected] = useState<string[]>(selectAll ? accounts.map((a) => a.id) : []),
    first = accounts[0]
  return (
    <FinancialEditor
      title="Update account setup & rules"
      save={save}
      close={close}
      submitLabel={`Update ${selected.length} accounts`}
      build={(data) =>
        tradingAccountRulesBatchSchema.parse(
          accounts
            .filter((a) => selected.includes(a.id))
            .map((a) => ({
              accountId: a.id,
              revision: a.revision,
              reason: text(data, 'reason'),
              tierCents: readMoney(data, 'tierCents'),
              maximumLossCents: readMoney(data, 'maximumLossCents'),
              dailyLossCents: readMoney(data, 'dailyLossCents'),
              ruleSnapshot: {
                ...readTradingRule(data),
                ...(latestSavedRule(a.ruleSnapshots)
                  ? { supersedesRuleId: latestSavedRule(a.ruleSnapshots)!.id }
                  : {}),
              },
            })),
        )
      }
    >
      <p className="text-xs text-slate-400">
        Edit the reviewed setup and saved rules for selected accounts. Existing balances, stages,
        payout paths, results and deposits are preserved. Earlier rule snapshots remain in history.
      </p>
      <AccountSelectionToolbar accounts={accounts} selected={selected} onChange={setSelected} />
      <div className="grid gap-2 sm:grid-cols-2">
        {accounts.map((a) => (
          <label
            key={a.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(a.id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                )
              }
            />
            {a.nickname} · {a.stage.toUpperCase()} / {a.xfaPath.replaceAll('_', ' ')}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AmountField name="tierCents" label="Nominal account tier ($)" value={first?.tierCents} />
        <AmountField
          name="maximumLossCents"
          label="Maximum loss limit ($)"
          value={first?.maximumLossCents}
        />
        <AmountField
          name="dailyLossCents"
          label="Daily loss limit ($)"
          value={first?.dailyLossCents}
        />
      </div>
      <TradingRuleFields rule={first ? latestSavedRule(first.ruleSnapshots) : undefined} />
      <FormField label="Reason for update">
        <Input name="reason" required maxLength={2000} />
      </FormField>
    </FinancialEditor>
  )
}
