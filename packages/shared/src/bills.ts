import { z } from 'zod'
import { debtPaymentMethodSchema, debtPaymentStatusSchema } from './debt-payments'

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
export const billFrequencySchema = z.enum([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'annually',
])
export const billInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(120),
    categoryId: z.uuid().nullable().optional(),
    kind: z.enum(['recurring', 'one_time']),
    amountType: z.enum(['fixed', 'variable']),
    amountCents: cents,
    estimatedAmountCents: cents,
    frequency: billFrequencySchema.nullable(),
    nextDueDate: z.iso.date(),
    endDate: z.iso.date().nullable(),
    autoPay: z.boolean(),
    status: z.enum(['active', 'inactive', 'cancelled']),
    notes: z.string().trim().max(4000).nullable(),
    linkedDebtId: z.uuid().nullable(),
    memberIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Select each member once'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'recurring' && !value.frequency)
      ctx.addIssue({ code: 'custom', message: 'Choose a frequency', path: ['frequency'] })
    if (
      value.kind === 'one_time' &&
      (value.frequency !== null || value.linkedDebtId !== null || value.endDate !== null)
    )
      ctx.addIssue({ code: 'custom', message: 'One-time bills cannot recur or link a debt' })
    if (value.endDate && value.endDate < value.nextDueDate)
      ctx.addIssue({ code: 'custom', message: 'End date must not precede the next due date' })
    if (value.amountType === 'fixed' && value.estimatedAmountCents !== null)
      ctx.addIssue({ code: 'custom', message: 'Use estimates only for variable bills' })
    if (value.amountType === 'variable' && value.amountCents !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'Enter actual variable amounts on individual billing periods',
      })
    if (value.kind === 'recurring' && value.status === 'cancelled')
      ctx.addIssue({
        code: 'custom',
        message: 'Deactivate recurring bills instead of cancelling them',
      })
    if (value.kind === 'one_time' && value.status === 'inactive')
      ctx.addIssue({
        code: 'custom',
        message: 'Cancel one-time bills instead of deactivating them',
      })
  })
export type BillInput = z.infer<typeof billInputSchema>
export type Bill = BillInput & {
  id: string
  householdId: string
  createdByUserId: string
  revision: number
  createdAt: string
  updatedAt: string
}
const billPaymentFieldsSchema = z
  .object({
    idempotencyKey: z.uuid(),
    amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    paymentDate: z.iso.date(),
    method: debtPaymentMethodSchema,
    notes: z.string().trim().max(4000).nullable(),
    status: debtPaymentStatusSchema.default('pending'),
    principalAmountCents: cents.default(null),
    interestAmountCents: cents.default(null),
    feesAmountCents: cents.default(null),
    referenceNumber: z.string().trim().max(120).nullable().default(null),
  })
  .strict()
export const billPaymentInputSchema = billPaymentFieldsSchema
  .refine(
    (value) =>
      (value.principalAmountCents ?? 0) +
        (value.interestAmountCents ?? 0) +
        (value.feesAmountCents ?? 0) <=
      value.amountCents,
    'Principal, interest, and fees cannot exceed the payment',
  )
  .safeExtend({
    billAmountConfirmation: z
      .object({
        amountCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
export const billPaymentEditSchema = billPaymentFieldsSchema.omit({ idempotencyKey: true }).extend({
  status: debtPaymentStatusSchema.optional(),
  principalAmountCents: cents.optional(),
  interestAmountCents: cents.optional(),
  feesAmountCents: cents.optional(),
  referenceNumber: z.string().trim().max(120).nullable().optional(),
})
export type BillPaymentInput = z.input<typeof billPaymentInputSchema>
export type BillPaymentValues = Omit<
  z.output<typeof billPaymentInputSchema>,
  'billAmountConfirmation'
>
export type BillPayment = Omit<BillPaymentValues, 'idempotencyKey'> & {
  id: string
  householdId: string
  billId: string
  periodId: string
  debtId: string | null
  debtPaymentId: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
export type BillPeriod = {
  id: string
  householdId: string
  billId: string
  dueDate: string
  amountCents: number | null
  billingPeriod: string
  estimatedAmountCents: number | null
  creditCents: number
  notes: string | null
  linkedDebtId: string | null
  name: string
  category: string
  categoryId?: string | null
  createdAt: string
  updatedAt: string
}
export type BillPeriodView = BillPeriod & {
  budgetEstimateCents?: number | null
  paidCents: number
  remainingCents: number | null
  overpaidCents: number
  amountIsEstimate: boolean
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'credited' | 'cancelled'
  overdue: boolean
}
export type BillView = Bill & {
  periods: BillPeriodView[]
  payments: BillPayment[]
  canManage: boolean
  requiresApproval: boolean
}
export const billPeriodInputSchema = z
  .object({
    amountCents: cents,
    creditCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    notes: z.string().trim().max(4000).nullable(),
  })
  .strict()
export const billActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit_bill'), changes: billInputSchema }),
  z.object({ action: z.literal('archive_bill') }),
  z.object({
    action: z.literal('edit_period'),
    periodId: z.uuid(),
    changes: billPeriodInputSchema,
  }),
  z.object({
    action: z.literal('edit_payment'),
    paymentId: z.uuid(),
    changes: billPaymentEditSchema,
  }),
  z.object({ action: z.literal('confirm_payment'), paymentId: z.uuid() }),
  z.object({ action: z.literal('cancel_payment'), paymentId: z.uuid() }),
])
export type BillAction = z.infer<typeof billActionSchema>
export const billRequestSchema = z
  .object({
    idempotencyKey: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
    proposal: billActionSchema,
  })
  .strict()
export type BillChangeRequest = {
  id: string
  billId: string
  householdId: string
  proposedByUserId: string
  proposedByName: string
  proposal: BillAction
  originalValues: { bill: Bill; periods: BillPeriod[]; payments: BillPayment[] }
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewedByUserId: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
}
export const billActionLabels: Record<BillAction['action'], string> = {
  edit_bill: 'Edit bill',
  archive_bill: 'Deactivate / cancel bill',
  edit_period: 'Change billing-period amount',
  edit_payment: 'Correct payment',
  confirm_payment: 'Confirm payment',
  cancel_payment: 'Cancel payment',
}
export type BillAuditEntry = {
  id: string
  billId: string
  actorUserId: string
  action: string
  targetId: string
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}
