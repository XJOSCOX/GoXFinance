import { z } from 'zod'
import type { Debt } from './debts'
import type { DebtPayment } from './debt-payments'
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const payoffScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    startDate: z.iso.date(),
    strategy: z.enum(['snowball', 'avalanche', 'custom', 'minimums']),
    extraCents: cents,
    availableCents: cents.nullable(),
    order: z
      .array(z.uuid())
      .max(200)
      .refine((a) => new Set(a).size === a.length, 'Select debts once'),
    assumptions: z
      .array(
        z
          .object({
            debtId: z.uuid(),
            balanceCents: cents.optional(),
            minimumCents: cents.optional(),
            apr: z
              .string()
              .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
              .optional(),
          })
          .strict(),
      )
      .max(200)
      .refine((a) => new Set(a.map((r) => r.debtId)).size === a.length, 'One assumption per debt'),
  })
  .strict()
export type PayoffScenarioInput = z.infer<typeof payoffScenarioSchema>
export const settlementSchema = z
  .object({
    debtId: z.uuid(),
    creditor: z.string().trim().min(1).max(160),
    originalBalanceCents: cents.nullable(),
    amountCents: cents,
    offerDate: z.iso.date(),
    expirationDate: z.iso.date().nullable(),
    kind: z.enum(['lump_sum', 'installments']),
    status: z.enum([
      'offered',
      'negotiating',
      'accepted',
      'rejected',
      'expired',
      'completed',
      'cancelled',
    ]),
    writtenConfirmed: z.boolean(),
    notes: z.string().max(4000).nullable(),
    document: z
      .object({ name: z.string().max(200), reference: z.string().max(300).nullable() })
      .strict()
      .nullable(),
    schedule: z
      .array(
        z
          .object({
            id: z.uuid(),
            dueDate: z.iso.date(),
            amountCents: cents,
            paymentId: z.uuid().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(360),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.expirationDate && v.expirationDate < v.offerDate)
      ctx.addIssue({ code: 'custom', message: 'Expiration precedes offer date' })
    if (v.kind === 'lump_sum' && v.schedule.length !== 1)
      ctx.addIssue({ code: 'custom', message: 'A lump sum has one scheduled payment' })
    if (v.schedule.reduce((n, p) => n + BigInt(p.amountCents), 0n) !== BigInt(v.amountCents))
      ctx.addIssue({
        code: 'custom',
        message: 'Schedule amounts must equal the settlement obligation',
      })
    if (
      new Set(v.schedule.map((p) => p.id)).size !== v.schedule.length ||
      new Set(v.schedule.map((p) => p.paymentId).filter(Boolean)).size !==
        v.schedule.filter((p) => p.paymentId).length
    )
      ctx.addIssue({ code: 'custom', message: 'Use each installment and payment once' })
  })
export type SettlementInput = z.infer<typeof settlementSchema>
export type SettlementOffer = SettlementInput & {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
  canManage: boolean
}
export function settlementProgress(offer: SettlementInput, payments: DebtPayment[], today: string) {
  const schedule = offer.schedule.map((item) => {
    const payment = payments.find((p) => p.id === item.paymentId && p.debtId === offer.debtId)
    const paidCents =
      payment?.paymentStatus === 'completed' && payment.paymentDate <= today
        ? payment.amountCents
        : 0
    return {
      ...item,
      paidCents,
      remainingCents: Math.max(0, item.amountCents - paidCents),
      overpaidCents: Math.max(0, paidCents - item.amountCents),
      missed: item.dueDate < today && paidCents < item.amountCents,
    }
  })
  const paidCents = schedule.reduce((n, p) => n + BigInt(p.paidCents), 0n)
  if (paidCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds supported range')
  const monthly = new Map<string, number>()
  for (const p of schedule)
    monthly.set(p.dueDate.slice(0, 7), (monthly.get(p.dueDate.slice(0, 7)) ?? 0) + p.amountCents)
  return {
    schedule,
    paidCents: Number(paidCents),
    remainingCents: schedule.reduce((n, p) => n + p.remainingCents, 0),
    overpaidCents: schedule.reduce((n, p) => n + p.overpaidCents, 0),
    savingsCents:
      offer.originalBalanceCents === null ? null : offer.originalBalanceCents - offer.amountCents,
    discountPercent: offer.originalBalanceCents
      ? (1 - offer.amountCents / offer.originalBalanceCents) * 100
      : null,
    completionDate: [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).at(-1)!
      .dueDate,
    initialCents: [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0].amountCents,
    monthly: [...monthly].map(([month, amountCents]) => ({ month, amountCents })),
  }
}
export type PlanningData = {
  canSave: boolean
  editableDebtIds: string[]
  debts: Debt[]
  payments: DebtPayment[]
  offers: SettlementOffer[]
  scenarios: { id: string; input: PayoffScenarioInput; debts: Debt[]; createdAt: string }[]
}
