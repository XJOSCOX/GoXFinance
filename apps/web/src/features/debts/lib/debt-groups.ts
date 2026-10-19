import { calculateDebtSummary, debtObligationGroups, type Debt } from '@goxfinance/shared'

const definitions = [
  { id: 'collections', label: 'Collections', description: 'Accounts reported in collection.' },
  {
    id: 'charged-off',
    label: 'Charged off',
    description: 'Charged-off balances may still be owed.',
  },
  {
    id: 'past-due',
    label: 'Past due',
    description: 'Delinquent accounts outside collections and charge-offs.',
  },
  { id: 'current', label: 'Current debts', description: 'Accounts reported as current.' },
  {
    id: 'other',
    label: 'Other accounts',
    description: 'Unknown, paid, or settled payment status.',
  },
] as const

type GroupId = (typeof definitions)[number]['id']
export type DebtGroup = (typeof definitions)[number] & {
  debts: Debt[]
  balanceCents: number
  unknownCount: number
  obligationCount: number
}

function classify(obligation: Debt[]): GroupId {
  if (
    obligation.some(
      (debt) => debt.accountType === 'collection' || debt.paymentStatus === 'collection',
    )
  )
    return 'collections'
  if (obligation.some((debt) => debt.paymentStatus === 'charged_off')) return 'charged-off'
  if (obligation.some((debt) => debt.paymentStatus.endsWith('_days_late'))) return 'past-due'
  if (obligation.every((debt) => debt.paymentStatus === 'current')) return 'current'
  return 'other'
}

// Keep verified original/collection records in one section, with one counted balance.
// The caller selects active OR archived records; copies allow archived summaries without mutations.
export function groupDebts(debts: Debt[]): DebtGroup[] {
  const normalized = debts.map((debt) => ({ ...debt, isArchived: false }))
  const groupById = new Map<string, GroupId>()
  for (const obligation of debtObligationGroups(normalized)) {
    const category = classify(obligation)
    for (const debt of obligation) groupById.set(debt.id, category)
  }
  return definitions
    .map((definition) => {
      const records = debts.filter((debt) => groupById.get(debt.id) === definition.id)
      const summary = calculateDebtSummary(
        normalized.filter((debt) => groupById.get(debt.id) === definition.id),
      )
      return {
        ...definition,
        debts: records,
        balanceCents:
          summary.confirmedBalanceCents +
          summary.estimatedBalanceCents +
          summary.unverifiedBalanceCents,
        unknownCount: summary.unknownBalanceCount,
        obligationCount: summary.countedObligationCount,
      }
    })
    .filter(
      (group) =>
        group.debts.length > 0 || ['collections', 'charged-off', 'current'].includes(group.id),
    )
}
