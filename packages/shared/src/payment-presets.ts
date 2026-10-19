import type { Debt } from './debts'
import type { BillPeriodView } from './bills'
export type PaymentAmountOption = {
  id: string
  label: string
  amountCents: number | null
  disabled: boolean
  warning?: string
}
const preset = (
  id: string,
  label: string,
  amountCents: number | null,
  warning?: string,
): PaymentAmountOption => ({
  id,
  label,
  amountCents,
  disabled: amountCents === null || amountCents <= 0,
  warning,
})
const custom: PaymentAmountOption = {
  id: 'custom',
  label: 'Other amount / Partial payment',
  amountCents: null,
  disabled: false,
}
export function debtPaymentOptions(
  debt: Pick<Debt, 'minimumPaymentCents' | 'currentBalanceCents' | 'pastDueAmountCents'>,
): PaymentAmountOption[] {
  return [
    preset('minimum', 'Monthly minimum payment', debt.minimumPaymentCents),
    preset(
      'full',
      'Full outstanding balance',
      debt.currentBalanceCents,
      'Confirm the final payoff amount with the creditor. Interest, fees, and timing may change it. Recording this payment will not settle or close the debt.',
    ),
    preset('past_due', 'Past-due amount', debt.pastDueAmountCents),
    custom,
  ]
}
export function billPaymentOptions(
  period: Pick<BillPeriodView, 'amountCents' | 'remainingCents'>,
): PaymentAmountOption[] {
  return [
    preset('full', 'Full billed amount', period.amountCents),
    preset('remaining', 'Remaining unpaid amount', period.remainingCents),
    custom,
  ]
}
