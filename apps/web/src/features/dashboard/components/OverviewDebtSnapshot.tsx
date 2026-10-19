import { Link } from 'react-router-dom'
import type { HouseholdOverview } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import { groupDebts } from '../../debts/lib/debt-groups'
export function OverviewDebtSnapshot({ data, home }: { data: HouseholdOverview; home: string }) {
  const summary = data.debts.summary
  const total =
    summary.confirmedBalanceCents + summary.estimatedBalanceCents + summary.unverifiedBalanceCents
  const groups = groupDebts(data.debts.debts.filter((debt) => !debt.isArchived))
  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Debt snapshot</h2>
        <Link to={`/households/${home}/debts`} className="text-xs text-[#b1beb0] hover:underline">
          View debts
        </Link>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        {formatMoney(total)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Recorded balances · {summary.countedObligationCount} obligations
      </p>
      <div className="mt-3 divide-y divide-white/[.07]">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-slate-300">
              {group.label}
              <span className="ml-2 text-xs text-slate-500">{group.debts.length}</span>
            </span>
            <span className="text-right">
              <span className="block font-medium tabular-nums">
                {formatMoney(
                  group.obligationCount > 0 && group.unknownCount === group.obligationCount
                    ? null
                    : group.balanceCents,
                )}
              </span>
              {group.unknownCount > 0 && (
                <span className="text-xs text-slate-500">{group.unknownCount} unknown</span>
              )}
            </span>
          </div>
        ))}
      </div>
      {summary.accountCount === 0 && (
        <p className="mt-3 text-sm text-slate-400">No debts recorded.</p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Shared debts and verified collection links count once. Balances are separate from monthly
        payments.
      </p>
    </Card>
  )
}
