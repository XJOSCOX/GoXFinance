import { z } from 'zod'

export const debtTypeSchema = z.enum(['credit_card', 'auto_loan', 'personal_loan', 'line_of_credit',
  'student_loan', 'medical_debt', 'collection', 'child_support', 'other'])
export const accountStatusSchema = z.enum(['open', 'closed', 'transferred', 'sold', 'unknown'])
export const paymentStatusSchema = z.enum(['current', '30_days_late', '60_days_late', '90_days_late',
  '120_plus_days_late', 'charged_off', 'collection', 'settled', 'paid', 'unknown'])
export const debtConfidenceSchema = z.enum(['confirmed', 'estimated', 'unverified'])
export const debtResponsibilitySchema = z.enum(['primary', 'joint', 'authorized_user', 'other'])

export type DebtType = z.infer<typeof debtTypeSchema>
export type AccountStatus = z.infer<typeof accountStatusSchema>
export type PaymentStatus = z.infer<typeof paymentStatusSchema>
export type DebtConfidence = z.infer<typeof debtConfidenceSchema>
export type DebtResponsibility = z.infer<typeof debtResponsibilitySchema>

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
const date = z.iso.date().nullable()
export const debtAssignmentSchema = z.object({
  memberId: z.uuid(), responsibility: debtResponsibilitySchema,
}).strict()
const assignments = z.array(debtAssignmentSchema).min(1, 'Assign at least one household member')
  .refine(items => new Set(items.map(item => item.memberId)).size === items.length, 'Select each member once')
const debtFieldsSchema = z.object({
  creditorName: z.string().trim().min(1, 'Enter a creditor').max(160),
  categoryId: z.uuid().nullable().optional(),
  accountNickname: z.string().trim().max(120).nullable().default(null),
  accountType: debtTypeSchema,
  accountStatus: accountStatusSchema.default('unknown'),
  paymentStatus: paymentStatusSchema.default('unknown'),
  originalBalanceCents: cents.default(null),
  currentBalanceCents: cents.default(null),
  pastDueAmountCents: cents.default(null),
  creditLimitCents: cents.default(null),
  interestRateApr: z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/, 'Enter an APR percentage').nullable().default(null),
  minimumPaymentCents: cents.default(null),
  dueDay: z.number().int().min(1).max(31).nullable().default(null),
  nextDueDate: date.default(null),
  lastPaymentDate: date.default(null),
  openedDate: date.default(null),
  closedDate: date.default(null),
  chargedOffDate: date.default(null),
  collectionAgency: z.string().trim().max(160).nullable().default(null),
  originalCreditor: z.string().trim().max(160).nullable().default(null),
  linkedOriginalDebtId: z.uuid().nullable().default(null),
  duplicateLinkVerified: z.boolean().default(false),
  balanceVerifiedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  confidence: debtConfidenceSchema.default('unverified'),
  notes: z.string().trim().max(4000).nullable().default(null),
  memberAssignments: assignments,
}).strict()
export const createDebtSchema = debtFieldsSchema.refine(value => !value.duplicateLinkVerified || value.linkedOriginalDebtId !== null,
  { message: 'Link an original debt before verifying a duplicate', path: ['linkedOriginalDebtId'] })

export const updateDebtSchema = debtFieldsSchema.partial().strict()
  .refine(value => Object.keys(value).length > 0, 'Enter at least one change')

export type DebtInput = z.input<typeof createDebtSchema>
export type DebtValues = z.output<typeof createDebtSchema>
export type DebtAssignment = z.infer<typeof debtAssignmentSchema>
export type Debt = Omit<DebtValues, 'memberAssignments'> & {
  id: string
  householdId: string
  createdByUserId: string
  memberAssignments: DebtAssignment[]
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export const debtTypeLabels: Record<DebtType, string> = {
  credit_card: 'Credit Card', auto_loan: 'Auto Loan', personal_loan: 'Personal Loan',
  line_of_credit: 'Line of Credit', student_loan: 'Student Loan', medical_debt: 'Medical Debt',
  collection: 'Collection', child_support: 'Child Support', other: 'Other',
}
export const accountStatusLabels: Record<AccountStatus, string> = {
  open: 'Open', closed: 'Closed', transferred: 'Transferred', sold: 'Sold', unknown: 'Unknown',
}
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  current: 'Current', '30_days_late': '30 Days Late', '60_days_late': '60 Days Late',
  '90_days_late': '90 Days Late', '120_plus_days_late': '120+ Days Late', charged_off: 'Charged Off',
  collection: 'Collection', settled: 'Settled', paid: 'Paid', unknown: 'Unknown',
}
