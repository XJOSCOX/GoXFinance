import {
  sumCents,
  type Expense,
  type ExpenseCategory,
  type HouseholdMember,
  type FinancialRefund,
} from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function SpendingBreakdown({
  expenses,
  categories,
  members,
  refunds = [],
}: {
  expenses: Expense[]
  categories: ExpenseCategory[]
  members: HouseholdMember[]
  refunds?: FinancialRefund[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-semibold">By category</h2>
        <div className="mt-3 space-y-2 text-sm">
          {categories
            .map((category) => ({
              ...category,
              total: sumCents([
                ...expenses
                  .flatMap((expense) => expense.allocations)
                  .filter((item) => item.categoryId === category.id)
                  .map((item) => item.amountCents),
                ...refunds
                  .flatMap((r) => r.allocations)
                  .filter((a) => a.categoryId === category.id)
                  .map((a) => -a.amountCents),
              ]),
            }))
            .filter((item) => item.total)
            .map((item) => (
              <p key={item.id} className="flex justify-between gap-3 text-slate-300">
                <span>{item.name}</span>
                <span className="tabular-nums">{formatMoney(item.total)}</span>
              </p>
            ))}
          {!expenses.length && <p className="text-slate-400">No spending for this selection.</p>}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">By member</h2>
        <div className="mt-3 space-y-2 text-sm">
          {members
            .map((member) => ({
              ...member,
              total: sumCents([
                ...expenses
                  .filter((item) => item.responsibleMemberId === member.id)
                  .map((item) => item.amountCents),
                ...refunds
                  .filter((r) => r.memberIds.includes(member.id))
                  .map((r) => -r.amountCents),
              ]),
            }))
            .filter((item) => item.total)
            .map((item) => (
              <p key={item.id} className="flex justify-between gap-3 text-slate-300">
                <span>{item.fullName}</span>
                <span className="tabular-nums">{formatMoney(item.total)}</span>
              </p>
            ))}
          {!expenses.length && <p className="text-slate-400">No spending for this selection.</p>}
        </div>
      </Card>
    </div>
  )
}
