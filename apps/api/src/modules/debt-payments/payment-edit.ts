import { completeDebtPaymentSchema, updateDebtPaymentSchema, type DebtPayment } from '@goxfinance/shared'

export function preparePaymentEdit(current: Pick<DebtPayment, 'paymentStatus' | 'amountCents' | 'paymentDate' | 'paymentMethod' |
  'principalAmountCents' | 'interestAmountCents' | 'feesAmountCents' | 'referenceNumber' | 'notes'>, input: unknown) {
  const patch = updateDebtPaymentSchema.parse(input)
  if (Object.keys(input as object).length === 0) throw new Error('Enter at least one change')
  if (current.paymentStatus === 'cancelled') throw new Error('Cancelled payments cannot be edited')
  const changes = Object.fromEntries(Object.keys(input as object).map(key => [key, patch[key as keyof typeof patch]]))
  const values = completeDebtPaymentSchema.parse({ amountCents: current.amountCents,
    paymentDate: current.paymentDate, paymentStatus: current.paymentStatus, paymentMethod: current.paymentMethod,
    principalAmountCents: current.principalAmountCents, interestAmountCents: current.interestAmountCents,
    feesAmountCents: current.feesAmountCents, referenceNumber: current.referenceNumber, notes: current.notes, ...changes })
  if (values.paymentStatus === 'completed' && current.paymentStatus !== 'completed') throw new Error('Use Confirm to complete a payment')
  if (values.paymentStatus === 'cancelled') throw new Error('Use Cancel to cancel a payment')
  if (current.paymentStatus === 'completed' && values.paymentStatus !== 'completed') throw new Error('Use Cancel to correct a completed payment status')
  return values
}
