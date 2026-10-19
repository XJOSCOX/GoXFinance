import { useEffect, useState } from 'react'
import type { Expense, ExpenseAudit, ExpenseCategory, HouseholdMember } from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { formatMoney } from '../../../lib/money'
import { errorMessage } from '../../../lib/api'
import { getExpense } from '../api/expenseClient'

export function ExpenseDetails({
  expense,
  categories,
  members,
  close,
}: {
  expense: Expense
  categories: ExpenseCategory[]
  members: HouseholdMember[]
  close: () => void
}) {
  const [audit, setAudit] = useState<ExpenseAudit[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void getExpense(expense.householdId, expense.id)
      .then((result) => {
        if (active) setAudit(result.audit)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
    return () => {
      active = false
    }
  }, [expense.householdId, expense.id])
  return (
    <Modal title={expense.description} onClose={close}>
      <div className="space-y-4 text-sm">
        <p className="text-2xl font-semibold">{formatMoney(expense.amountCents)}</p>
        <p>
          {expense.merchant ?? 'No merchant'} · {expense.transactionDate}
        </p>
        <p>
          {members.find((item) => item.id === expense.responsibleMemberId)?.fullName} ·{' '}
          {expense.paymentMethod.replaceAll('_', ' ')} · {expense.voided ? 'Voided' : 'Recorded'}
        </p>
        <div className="space-y-2">
          {expense.allocations.map((item) => (
            <p key={item.categoryId} className="flex justify-between gap-3">
              <span>{categories.find((category) => category.id === item.categoryId)?.name}</span>
              <span>{formatMoney(item.amountCents)}</span>
            </p>
          ))}
        </div>
        {expense.notes && <p className="whitespace-pre-wrap text-slate-400">{expense.notes}</p>}
        <h3 className="font-semibold">Audit history</h3>
        {audit.map((item) => (
          <details key={item.id}>
            <summary className="cursor-pointer text-slate-400">
              {item.action} · {new Date(item.createdAt).toLocaleString()}
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(
                {
                  actor: item.actorUserId,
                  before: item.beforeJson ? JSON.parse(item.beforeJson) : null,
                  after: item.afterJson ? JSON.parse(item.afterJson) : null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
