import type { BillPeriodView } from './bills'
import { sumCents } from './outflows'

// Progress covers actual bills due in the selected month, not estimates or debt balances.
export function billProgress(periods: BillPeriodView[]) {
  const known = periods.filter((period) => typeof period.amountCents === 'number')
  const billedCents = sumCents(known.map((period) => period.amountCents!))
  const paidCents = sumCents(known.map((period) => Math.min(period.amountCents!, period.paidCents)))
  const creditCents = sumCents(
    known.map((period) =>
      Math.min(Math.max(0, period.amountCents! - period.paidCents), period.creditCents),
    ),
  )
  const covered = sumCents([paidCents, creditCents])
  return {
    billedCents,
    paidCents,
    creditCents,
    remainingCents: billedCents - covered,
    totalCount: periods.length,
    settledCount: known.filter((period) => period.remainingCents === 0).length,
    unknownCount: periods.length - known.length,
    percent:
      billedCents > 0
        ? Math.min(covered < billedCents ? 99 : 100, Math.floor((covered / billedCents) * 100))
        : null,
  }
}
