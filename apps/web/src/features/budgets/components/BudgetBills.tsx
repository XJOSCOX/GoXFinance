import type { BudgetReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function BudgetBills({ bills }: { bills: BudgetReport['bills'] }) {
  return (
    <Card className="mt-4 min-w-0 p-4">
      <h2 className="text-sm font-semibold">Bill obligations due this month</h2>
      <p className="mt-1 text-xs text-slate-500">
        Recorded periods; these amounts do not add to spending until paid. Payments on debt-linked
        bills remain transfers.
      </p>
      {bills.length > 0 && (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[600px] text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                {[
                  'Bill / due date',
                  'Budget estimate',
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
                  <td>{formatMoney(b.estimateCents)}</td>
                  <td>{formatMoney(b.billedCents)}</td>
                  <td>{formatMoney(b.paidCents)}</td>
                  <td>{formatMoney(b.remainingCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!bills.length && (
        <p className="mt-4 text-xs text-slate-400">No recorded bill periods due in this month.</p>
      )}
    </Card>
  )
}
