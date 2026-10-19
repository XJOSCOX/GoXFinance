import { tradingRuleSchema, type TradingRule } from '@goxfinance/shared'
import { optionalText, readMoney, text } from '../../../lib/financial-entry'

export const ruleFields: {
  key: keyof TradingRule
  label: string
  kind: 'money' | 'percent' | 'integer' | 'boolean'
  group: string
}[] = [
  {
    key: 'profitShareBps',
    label: 'Trader profit share (%)',
    kind: 'percent',
    group: 'Payout rules',
  },
  { key: 'maximumPayoutCents', label: 'Maximum payout ($)', kind: 'money', group: 'Payout rules' },
  {
    key: 'minimumDays',
    label: 'Minimum qualifying trading days',
    kind: 'integer',
    group: 'Payout rules',
  },
  {
    key: 'minimumWinningDayCents',
    label: 'Minimum winning day ($)',
    kind: 'money',
    group: 'Payout rules',
  },
  {
    key: 'minimumNetCents',
    label: 'Minimum total net profit ($)',
    kind: 'money',
    group: 'Payout rules',
  },
  {
    key: 'minimumTradesPerDay',
    label: 'Minimum trades per qualifying day',
    kind: 'integer',
    group: 'Payout rules',
  },
  {
    key: 'payoutConsistencyBps',
    label: 'Payout best-day limit (%)',
    kind: 'percent',
    group: 'Payout rules',
  },
  {
    key: 'maintainBalanceBetweenPayouts',
    label: 'Maintain balance between payouts',
    kind: 'boolean',
    group: 'Payout rules',
  },
  {
    key: 'enhancedPayoutCap',
    label: 'Enhanced payout cap included',
    kind: 'boolean',
    group: 'Payout rules',
  },
  {
    key: 'profitTargetCents',
    label: 'Evaluation profit target ($)',
    kind: 'money',
    group: 'Evaluation and plan',
  },
  {
    key: 'combineConsistencyBps',
    label: 'Evaluation consistency target (%)',
    kind: 'percent',
    group: 'Evaluation and plan',
  },
  {
    key: 'maximumMiniContracts',
    label: 'Maximum mini contracts',
    kind: 'integer',
    group: 'Evaluation and plan',
  },
  {
    key: 'maximumMicroContracts',
    label: 'Maximum micro contracts',
    kind: 'integer',
    group: 'Evaluation and plan',
  },
  {
    key: 'monthlyFeeCents',
    label: 'Monthly plan fee ($)',
    kind: 'money',
    group: 'Evaluation and plan',
  },
  { key: 'resetFeeCents', label: 'Reset fee ($)', kind: 'money', group: 'Evaluation and plan' },
  {
    key: 'activationFeeCents',
    label: 'Funded activation fee ($)',
    kind: 'money',
    group: 'Evaluation and plan',
  },
  {
    key: 'resetCreditOnRebill',
    label: 'Monthly reset credit included',
    kind: 'boolean',
    group: 'Evaluation and plan',
  },
]

export function readTradingRule(data: FormData) {
  return tradingRuleSchema.parse({
    version: 2,
    label: text(data, 'ruleLabel'),
    effectiveDate: text(data, 'ruleDate'),
    notes: optionalText(data, 'ruleNotes'),
    ...Object.fromEntries(
      ruleFields.map(({ key, kind }) => {
        const name = 'rule:' + key,
          value = optionalText(data, name)
        return [
          key,
          value === null
            ? null
            : kind === 'boolean'
              ? value === 'yes'
              : kind === 'integer'
                ? Number(value)
                : readMoney(data, name),
        ]
      }),
    ),
  })
}
