import type { TradingAccount } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { TradingRuleFields } from './TradingRuleFields'
import { readTradingRule } from '../lib/rule-fields'

export function EditRuleForm({
  account,
  rule,
  save,
  close,
}: {
  account: TradingAccount
  rule: TradingAccount['ruleSnapshots'][number]
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  return (
    <FinancialEditor
      title={`Edit rule · ${account.nickname}`}
      record={account}
      save={save}
      close={close}
      submitLabel="Save rule changes"
      build={readTradingRule}
    >
      <p className="text-xs text-slate-400">
        Edit the saved rule below. Its previous version remains in history, and existing payout
        records keep their historical estimates. Results, balances and deposits are unchanged.
      </p>
      <TradingRuleFields rule={rule} />
    </FinancialEditor>
  )
}
