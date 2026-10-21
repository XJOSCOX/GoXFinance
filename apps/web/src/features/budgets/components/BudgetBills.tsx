import type { BudgetReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { InfoHint } from '../../../components/ui/InfoHint'
export function BudgetBills({ bills }: { bills: BudgetReport['bills'] }) {
  return (
    <Card className="mt-4 min-w-0 p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Bill obligations this month{' '}
          <span className="ml-2 text-xs font-normal text-slate-500">{bills.length} periods</span>
        </summary>
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          Estimates, actual bills and payments{' '}
          <InfoHint
            label="Budget bill amounts explained"
            text="Recorded bill periods do not add to spending until paid. Payments on debt-linked bills remain transfers. A dash means the amount is not known; estimates do not confirm an actual bill."
          />
        </div>
        {bills.length > 0 && (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  {[
                    'Bill / due date',
                    'Monthly Estimate',
                    'Actual billed',
                    'Actually paid',
                    'Still owed',
                  ].map((h) => (
                    <th key={h} className="py-2 pr-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-t border-white/10">
                    <td className="py-3 pr-3">
                      {b.name}
                      <span className="block text-slate-500">{b.dueDate}</span>
                    </td>
                    <td>
                      {b.estimateCents === null
                        ? '—'
                        : (b.estimateIsVariable === false ? '' : '≈ ') +
                          formatMoney(b.estimateCents)}
                    </td>
                    <td>{b.billedCents === null ? '—' : formatMoney(b.billedCents)}</td>
                    <td>{formatMoney(b.paidCents)}</td>
                    <td>{b.remainingCents === null ? '—' : formatMoney(b.remainingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!bills.length && (
          <p className="mt-4 text-xs text-slate-400">No recorded bill periods due in this month.</p>
        )}
      </details>
    </Card>
  )
}
