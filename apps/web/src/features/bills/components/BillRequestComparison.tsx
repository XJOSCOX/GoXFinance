import type { BillChangeRequest, Debt, HouseholdMember } from '@goxfinance/shared'
import { ValueComparison } from '../../../components/ui/ValueComparison'
import { formatMoney } from '../../../lib/money'

export function BillRequestComparison({
  request,
  members,
  debts,
}: {
  request: BillChangeRequest
  members: HouseholdMember[]
  debts: Debt[]
}) {
  const proposal = request.proposal
  function display(key: string, value: unknown): string {
    if (value === null || value === undefined) return 'Unknown'
    if (key.endsWith('Cents') && typeof value === 'number') return formatMoney(value)
    if (key === 'memberIds' && Array.isArray(value))
      return value
        .map((id) => members.find((member) => member.id === id)?.fullName ?? 'Unavailable member')
        .join(', ')
    if (key === 'linkedDebtId')
      return debts.find((debt) => debt.id === value)?.creditorName ?? 'Unavailable debt'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value).replaceAll('_', ' ')
  }
  let original: Record<string, unknown>, changes: Record<string, unknown>
  if (proposal.action === 'edit_bill') {
    original = request.originalValues.bill
    changes = proposal.changes
  } else if (proposal.action === 'archive_bill') {
    original = request.originalValues.bill
    changes = {
      status: request.originalValues.bill.kind === 'recurring' ? 'inactive' : 'cancelled',
    }
  } else if (proposal.action === 'edit_period') {
    original = request.originalValues.periods.find((item) => item.id === proposal.periodId) ?? {}
    changes = proposal.changes
  } else {
    original = request.originalValues.payments.find((item) => item.id === proposal.paymentId) ?? {}
    changes =
      proposal.action === 'edit_payment'
        ? proposal.changes
        : { status: proposal.action === 'confirm_payment' ? 'completed' : 'cancelled' }
  }
  const rows = Object.entries(changes)
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key]))
    .map(([key, value]) => ({
      label: key
        .replace(/([A-Z])/g, ' $1')
        .replace(' Cents', '')
        .replace(' Ids', '')
        .replace(' Id', ''),
      before: display(key, original[key]),
      after: display(key, value),
    }))
  return <ValueComparison rows={rows} />
}
