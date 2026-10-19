import { z } from 'zod'
import { completeDebtPaymentSchema, verifyDebtBalanceSchema } from './debt-payments'

export const debtChangeInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit_payment'), paymentId: z.uuid(), changes: completeDebtPaymentSchema }),
  z.object({ action: z.literal('cancel_payment'), paymentId: z.uuid() }),
  z.object({ action: z.literal('confirm_payment'), paymentId: z.uuid() }),
  z.object({ action: z.literal('verify_balance'), changes: verifyDebtBalanceSchema }),
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
}
