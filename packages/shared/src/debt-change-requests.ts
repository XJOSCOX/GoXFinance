import { z } from 'zod'
import { completeDebtPaymentSchema, verifyDebtBalanceSchema } from './debt-payments'
import { updateDebtSchema } from './debts'

// Zod defaults belong to complete accounts, not sparse approval proposals.
// Preserve the submitted keys so approving a creditor edit cannot clear balances.
const accountChanges = z.record(z.string(), z.unknown()).transform((input, ctx) => {
  if (!Object.keys(input).length) {
    ctx.addIssue({ code: 'custom', message: 'Enter at least one change' })
    return z.NEVER
  }
  const parsed = updateDebtSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
    return z.NEVER
  }
  return Object.fromEntries(Object.keys(input).map(key => [key, parsed.data[key as keyof typeof parsed.data]])) as z.output<typeof updateDebtSchema>
})

export const debtChangeInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit_payment'), paymentId: z.uuid(), changes: completeDebtPaymentSchema }),
  z.object({ action: z.literal('cancel_payment'), paymentId: z.uuid() }),
  z.object({ action: z.literal('confirm_payment'), paymentId: z.uuid() }),
  z.object({ action: z.literal('verify_balance'), changes: verifyDebtBalanceSchema }),
  z.object({ action: z.literal('edit_account'), changes: accountChanges }),
  z.object({ action: z.literal('archive_account') }),
  z.object({ action: z.literal('restore_account') }),
]).and(z.object({ idempotencyKey: z.uuid(), reason: z.string().trim().min(1).max(2000) }))

export type DebtChangeInput = z.input<typeof debtChangeInputSchema>
export type DebtChangeValues = z.output<typeof debtChangeInputSchema>
export type DebtChangeRequest = {
  id: string; householdId: string; debtId: string; paymentId: string | null; proposedByUserId: string;
  proposedByName: string; creditorName: string; action: DebtChangeValues['action']; reason: string;
  proposedChanges: Record<string, unknown>; originalValues: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'; reviewNote: string | null;
  reviewedByUserId: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string
}
export const debtChangeLabels: Record<DebtChangeValues['action'], string> = {
  edit_payment: 'Edit payment', cancel_payment: 'Cancel payment', confirm_payment: 'Confirm payment', verify_balance: 'Record verified balance',
  edit_account: 'Edit account', archive_account: 'Archive account', restore_account: 'Restore account',
}
