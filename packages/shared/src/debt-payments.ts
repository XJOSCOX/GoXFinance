import { z } from 'zod'

export const debtPaymentStatusSchema = z.enum(['scheduled', 'pending', 'completed', 'failed', 'cancelled'])
export const debtPaymentMethodSchema = z.enum(['bank_transfer', 'debit_card', 'credit_card', 'cash', 'check', 'other'])
export const balanceSourceSchema = z.enum(['initial', 'creditor_statement', 'manual_adjustment', 'reconciliation'])
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const optionalCents = cents.nullable()

const paymentFields = z.object({
  amountCents: cents.positive(),
  paymentDate: z.iso.date(),
  paymentStatus: debtPaymentStatusSchema,
  paymentMethod: debtPaymentMethodSchema,
  principalAmountCents: optionalCents.default(null),
  interestAmountCents: optionalCents.default(null),
  feesAmountCents: optionalCents.default(null),
  referenceNumber: z.string().trim().max(120).nullable().default(null),
  notes: z.string().trim().max(4000).nullable().default(null),
}).strict()

function allocationValid(value: z.output<typeof paymentFields>) {
  return (value.principalAmountCents ?? 0) + (value.interestAmountCents ?? 0) + (value.feesAmountCents ?? 0) <= value.amountCents
}
export const createDebtPaymentSchema = paymentFields.extend({ idempotencyKey: z.uuid() }).refine(allocationValid,
  { message: 'Principal, interest, and fees cannot exceed the payment', path: ['principalAmountCents'] })
export const updateDebtPaymentSchema = paymentFields.partial().refine(value => Object.keys(value).length > 0,
  'Enter at least one change')
export const completeDebtPaymentSchema = paymentFields.refine(allocationValid,
  { message: 'Principal, interest, and fees cannot exceed the payment', path: ['principalAmountCents'] })
export const verifyDebtBalanceSchema = z.object({
  idempotencyKey: z.uuid().optional(),
  balanceCents: cents,
  effectiveDate: z.iso.date(),
  source: z.enum(['creditor_statement', 'reconciliation']),
  notes: z.string().trim().max(4000).nullable().default(null),
}).strict()

export type DebtPaymentInput = z.input<typeof createDebtPaymentSchema>
export type DebtPaymentValues = z.output<typeof createDebtPaymentSchema>
export type DebtPayment = Omit<DebtPaymentValues, 'idempotencyKey'> & {
  id: string; householdId: string; debtId: string; createdByUserId: string; idempotencyKey: string;
  createdAt: string; updatedAt: string
}
export type DebtBalanceHistory = {
  id: string; householdId: string; debtId: string; balanceCents: number; effectiveDate: string;
  source: z.infer<typeof balanceSourceSchema>; recordedByUserId: string; notes: string | null; createdAt: string
}

export const debtPaymentStatusLabels: Record<z.infer<typeof debtPaymentStatusSchema>, string> = {
  scheduled: 'Scheduled', pending: 'Pending', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}
export const paymentMethodLabels: Record<z.infer<typeof debtPaymentMethodSchema>, string> = {
  bank_transfer: 'Bank transfer', debit_card: 'Debit card', credit_card: 'Credit card', cash: 'Cash', check: 'Check', other: 'Other',
}
