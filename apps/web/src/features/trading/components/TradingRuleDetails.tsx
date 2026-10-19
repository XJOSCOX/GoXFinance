import type { TradingRule } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
import { ruleFields } from '../lib/rule-fields'

export function TradingRuleDetails({ rule }: { rule: TradingRule }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-white/10 p-3">
      <p>
        {rule.label} / effective {rule.effectiveDate}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {ruleFields.map(({ key, label, kind }) => {
          const value = rule[key]
          if (value == null) return null
          const formatted =
            kind === 'money'
              ? formatMoney(value as number)
              : kind === 'percent'
                ? `${Number(value) / 100}%`
                : kind === 'boolean'
                  ? value
                    ? 'Yes'
                    : 'No'
                  : String(value)
          return (
            <div key={key}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="mt-1">{formatted}</dd>
            </div>
          )
        })}
      </dl>
      {rule.profitShareBps != null && (
        <p className="text-slate-400">Provider share: {(10000 - rule.profitShareBps) / 100}%</p>
      )}
      <p className="whitespace-pre-wrap text-slate-400">{rule.notes}</p>
    </div>
  )
}
