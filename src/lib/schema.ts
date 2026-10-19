import { z } from 'zod'

const money = z.number().finite().nonnegative().nullable()
const date = z.iso.date().nullable()
const base = z.object({ id: z.string().uuid(), name: z.string().trim().min(1), notes: z.string().default(''), confidence: z.enum(['confirmed', 'estimated', 'unverified']).default('confirmed'), createdAt: z.string(), updatedAt: z.string() })
export const memberSchema = base.extend({ role: z.string().default('Household member') })
export const incomeSchema = base.extend({ memberId: z.string().nullable().default(null), amount: money, frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'annual', 'variable']), kind: z.enum(['employment', 'benefit', 'other']).default('employment'), hourlyRate: money.default(null), active: z.boolean().default(true) })
export const expenseSchema = base.extend({ amount: money, frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'annual', 'variable']), category: z.enum(['housing', 'utilities', 'food', 'transport', 'legal', 'insurance', 'health', 'other']), dueDay: z.number().int().min(1).max(31).nullable().default(null), active: z.boolean().default(true), priority: z.number().int().min(1).max(9).default(5) })
const oldDebtSchema = base.extend({ creditor: z.string().min(1), ownerId: z.string().nullable().default(null), balance: money, apr: z.number().min(0).max(100).nullable(), minimumPayment: money, status: z.enum(['current', 'late', 'collection', 'settled', 'closed', 'unverified']), dueDate: date, daysLate: z.number().int().min(0).nullable(), security: z.enum(['secured', 'unsecured', 'unknown']), settlementOffer: money, collectionAgency: z.string().default(''), originalDebtId: z.string().nullable().default(null), priority: z.number().int().min(1).max(9).default(5), active: z.boolean().default(true), history: z.array(z.object({ at: z.string(), detail: z.string() })).default([]) })
export const debtSchema = oldDebtSchema.extend({ ownerType: z.enum(['mine', 'spouse', 'joint']).default('mine'), originalBalance: money.default(null), fees: money.default(null), courtOrdered: z.boolean().default(false), transportationRisk: z.boolean().default(false), activeAtRisk: z.boolean().default(false), creditUtilization: z.number().min(0).max(100).nullable().default(null), userUrgency: z.number().int().min(1).max(5).default(3), priorityOverride: z.enum(['Critical', 'High', 'Medium', 'Low']).nullable().default(null), priorityExplanation: z.string().default(''), chargeOff: z.boolean().default(false) })
export const paymentSchema = base.extend({ debtId: z.string().nullable().default(null), settlementId: z.string().nullable().default(null), expenseId: z.string().nullable().default(null), date: z.iso.date(), amount: z.number().finite().nonnegative(), kind: z.enum(['debt', 'expense', 'transfer', 'credit-card-payment', 'other']), cashOutflow: z.boolean().default(true) })
const oldSettlementSchema = base.extend({ debtId: z.string(), offerAmount: money, agreedAmount: money, paidAmount: money, status: z.enum(['proposed', 'accepted', 'paid', 'rejected']), date })
export const settlementSchema = base.extend({ debtId: z.string(), offerAmount: money, offerPercent: z.number().min(0).max(100).nullable().default(null), agreedAmount: money, paidAmount: money, status: z.enum(['proposed', 'negotiating', 'accepted', 'completed', 'expired', 'defaulted']), date, planType: z.enum(['lump-sum', 'installments']).default('lump-sum'), downPayment: money.default(null), installments: z.number().int().min(1).max(120).default(1), firstDueDate: date.default(null), offerExpiration: date.default(null), writtenAgreement: z.boolean().default(false) })
export const savingsSchema = base.extend({ target: money, saved: money, monthlyContribution: money, kind: z.enum(['emergency', 'home', 'other']), targetDate: date })
export const tradingSchema = base.extend({ platform: z.string(), fundedBalance: money, realizedProfit: money, actualPayout: money, fees: money, taxReserve: money, drawdown: money, projectedPayout: money })
export const oneTimeExpenseSchema = base.extend({ amount: money, date: z.iso.date(), category: z.enum(['housing', 'utilities', 'food', 'transport', 'legal', 'insurance', 'health', 'other']).default('other') })
export const tradingPayoutSchema = base.extend({ tradingId: z.string(), amount: z.number().finite().nonnegative(), date: z.iso.date() })
export const settingsSchema = z.object({ theme: z.enum(['light', 'dark']).default('dark'), monthlyEssentialsBuffer: z.number().nonnegative().default(0), homeCreditMilestone: z.number().int().min(300).max(850).nullable().default(null), startingCash: z.number().finite().default(0), monthlyEmergencySavings: z.number().nonnegative().default(0), monthlyExtraDebtPayment: z.number().nonnegative().default(0) })
export const backupSchema = z.object({ format: z.literal('goxplan'), version: z.literal(2), exportedAt: z.string(), members: z.array(memberSchema), incomes: z.array(incomeSchema), expenses: z.array(expenseSchema), debts: z.array(debtSchema), payments: z.array(paymentSchema), settlements: z.array(settlementSchema), savings: z.array(savingsSchema), trading: z.array(tradingSchema), oneTimeExpenses: z.array(oneTimeExpenseSchema), tradingPayouts: z.array(tradingPayoutSchema), settings: settingsSchema })
const oldBackupSchema = z.object({ format: z.literal('goxplan'), version: z.literal(1), exportedAt: z.string(), members: z.array(memberSchema), incomes: z.array(incomeSchema), expenses: z.array(expenseSchema), debts: z.array(oldDebtSchema), payments: z.array(paymentSchema), settlements: z.array(oldSettlementSchema), savings: z.array(savingsSchema), trading: z.array(tradingSchema), settings: settingsSchema })
export function parseBackup(value: unknown): Backup {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid backup')
  if ('version' in value && value.version === 1) {
    const old = oldBackupSchema.parse(value)
    return backupSchema.parse({ ...old, version: 2, oneTimeExpenses: [], tradingPayouts: [], settlements: old.settlements.map(s => ({ ...s, status: s.status === 'paid' && (s.paidAmount ?? 0) >= (s.agreedAmount ?? s.offerAmount ?? Infinity) ? 'completed' : s.status === 'rejected' ? 'expired' : s.status === 'paid' ? 'accepted' : s.status })) })
  }
  return backupSchema.parse(value)
}
export type Member = z.infer<typeof memberSchema>
export type Income = z.infer<typeof incomeSchema>
export type Expense = z.infer<typeof expenseSchema>
export type Debt = z.infer<typeof debtSchema>
export type Payment = z.infer<typeof paymentSchema>
export type Settlement = z.infer<typeof settlementSchema>
export type Savings = z.infer<typeof savingsSchema>
export type Trading = z.infer<typeof tradingSchema>
export type OneTimeExpense = z.infer<typeof oneTimeExpenseSchema>
export type TradingPayout = z.infer<typeof tradingPayoutSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Backup = z.infer<typeof backupSchema>
export type Collection = 'members' | 'incomes' | 'expenses' | 'debts' | 'payments' | 'settlements' | 'savings' | 'trading' | 'oneTimeExpenses' | 'tradingPayouts'
export const schemas = { members: memberSchema, incomes: incomeSchema, expenses: expenseSchema, debts: debtSchema, payments: paymentSchema, settlements: settlementSchema, savings: savingsSchema, trading: tradingSchema, oneTimeExpenses: oneTimeExpenseSchema, tradingPayouts: tradingPayoutSchema } as const
export const emptyBackup = (): Backup => ({ format: 'goxplan', version: 2, exportedAt: new Date().toISOString(), members: [], incomes: [], expenses: [], debts: [], payments: [], settlements: [], savings: [], trading: [], oneTimeExpenses: [], tradingPayouts: [], settings: settingsSchema.parse({}) })
export const newBase = (name: string) => ({ id: crypto.randomUUID(), name, notes: '', confidence: 'confirmed' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
