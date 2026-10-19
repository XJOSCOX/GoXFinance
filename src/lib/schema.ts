import { z } from 'zod'

const money = z.number().finite().nonnegative().nullable()
const amount = z.number().finite().nonnegative()
const date = z.iso.date().nullable()
const base = z.object({ id: z.string().uuid(), name: z.string().trim().min(1), notes: z.string().default(''), confidence: z.enum(['confirmed', 'estimated', 'unverified']).default('confirmed'), createdAt: z.string(), updatedAt: z.string() })
// The original local household key predates RFC 4122 variant enforcement; retain it for all existing databases.
export const householdSchema = z.object({ id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), name: z.string().trim().min(1), createdAt: z.string(), updatedAt: z.string() })
export const memberSchema = base.extend({ role: z.string().default('Household member') })
export const incomeSchema = base.extend({ memberId: z.string().nullable().default(null), amount: money, frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'annual', 'variable']), kind: z.enum(['employment', 'benefit', 'other']).default('employment'), payType: z.enum(['hourly', 'salaried', 'variable']).default('salaried'), hourlyRate: money.default(null), active: z.boolean().default(true) })
export const expenseSchema = base.extend({ amount: money, frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'annual', 'variable']), category: z.enum(['housing', 'utilities', 'food', 'transport', 'legal', 'insurance', 'health', 'other']), dueDay: z.number().int().min(1).max(31).nullable().default(null), active: z.boolean().default(true), priority: z.number().int().min(1).max(9).default(5) })
const oldDebtSchema = base.extend({ creditor: z.string().min(1), ownerId: z.string().nullable().default(null), balance: money, apr: z.number().min(0).max(100).nullable(), minimumPayment: money, status: z.enum(['current', 'late', 'collection', 'settled', 'closed', 'unverified']), dueDate: date, daysLate: z.number().int().min(0).nullable(), security: z.enum(['secured', 'unsecured', 'unknown']), settlementOffer: money, collectionAgency: z.string().default(''), originalDebtId: z.string().nullable().default(null), priority: z.number().int().min(1).max(9).default(5), active: z.boolean().default(true), history: z.array(z.object({ at: z.string(), detail: z.string() })).default([]) })
export const debtSchema = oldDebtSchema.extend({ ownerType: z.enum(['mine', 'spouse', 'joint']).default('mine'), originalBalance: money.default(null), fees: money.default(null), courtOrdered: z.boolean().default(false), transportationRisk: z.boolean().default(false), activeAtRisk: z.boolean().default(false), creditUtilization: z.number().min(0).max(100).nullable().default(null), userUrgency: z.number().int().min(1).max(5).default(3), priorityOverride: z.enum(['Critical', 'High', 'Medium', 'Low']).nullable().default(null), priorityExplanation: z.string().default(''), chargeOff: z.boolean().default(false), verifiedBalance: money.default(null), verifiedAt: date.default(null), linkVerified: z.boolean().default(false) })
export const paymentSchema = base.extend({ debtId: z.string().nullable().default(null), settlementId: z.string().nullable().default(null), expenseId: z.string().nullable().default(null), bankAccountId: z.string().nullable().default(null), date: z.iso.date(), amount, kind: z.enum(['debt', 'expense', 'transfer', 'credit-card-payment', 'other']), cashOutflow: z.boolean().default(true) })
const oldSettlementSchema = base.extend({ debtId: z.string(), offerAmount: money, agreedAmount: money, paidAmount: money, status: z.enum(['proposed', 'accepted', 'paid', 'rejected']), date })
export const settlementSchema = base.extend({ debtId: z.string(), offerAmount: money, offerPercent: z.number().min(0).max(100).nullable().default(null), agreedAmount: money, paidAmount: money, status: z.enum(['proposed', 'negotiating', 'accepted', 'completed', 'expired', 'defaulted']), date, planType: z.enum(['lump-sum', 'installments']).default('lump-sum'), downPayment: money.default(null), installments: z.number().int().min(1).max(120).default(1), firstDueDate: date.default(null), offerExpiration: date.default(null), writtenAgreement: z.boolean().default(false) })
export const savingsSchema = base.extend({ target: money, saved: money, monthlyContribution: money, kind: z.enum(['emergency', 'home', 'other']), targetDate: date })
export const tradingSchema = base.extend({ platform: z.string(), fundedBalance: money, realizedProfit: money, actualPayout: money, fees: money, taxReserve: money, drawdown: money, projectedPayout: money })
export const oneTimeExpenseSchema = base.extend({ amount: money, date: z.iso.date(), category: z.enum(['housing', 'utilities', 'food', 'transport', 'legal', 'insurance', 'health', 'other']).default('other') })
export const tradingPayoutSchema = base.extend({ tradingId: z.string(), bankAccountId: z.string().nullable().default(null), amount, date: z.iso.date() })
export const bankAccountSchema = base.extend({ institution: z.string().default(''), accountType: z.enum(['checking', 'savings', 'cash', 'other']), lastFour: z.string().max(4).nullable().default(null), balance: money.default(null), initialBalance: money.default(null), confirmedBalance: money.default(null), confirmedAt: date.default(null) })
export const incomeTransactionSchema = base.extend({ sourceId: z.string().nullable().default(null), bankAccountId: z.string().nullable().default(null), amount, date: z.iso.date(), gross: money.default(null), deductions: money.default(null), regularHours: z.number().finite().nonnegative().nullable().default(null), overtimeHours: z.number().finite().nonnegative().nullable().default(null), overtimeMultiplier: z.number().finite().min(1).default(1.5), hourlyRateSnapshot: money.default(null), workPeriodStart: date.default(null), workPeriodEnd: date.default(null), confirmationDate: date.default(null) })
export const incomeRevisionSchema = base.extend({ incomeTransactionId: z.string().uuid(), previousSnapshot: z.string(), nextSnapshot: z.string(), date: z.iso.date(), reason: z.string().trim().min(1) })
export const expenseTransactionSchema = base.extend({ expenseId: z.string().nullable().default(null), bankAccountId: z.string().nullable().default(null), categoryId: z.string().nullable().default(null), amount, date: z.iso.date(), category: z.string().default('other'), kind: z.enum(['expense', 'adjustment']).default('expense'), cashOutflow: z.boolean().default(true) })
export const bankTransferSchema = base.extend({ fromAccountId: z.string(), toAccountId: z.string(), amount: z.number().finite().positive(), date: z.iso.date() })
export const categorySchema = base.extend({ kind: z.enum(['income', 'expense', 'savings', 'other']) })
export const monthlyBudgetSchema = base.extend({ categoryId: z.string().nullable().default(null), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), planned: amount, actual: money.default(null) })
export const tradingTransactionSchema = base.extend({ tradingId: z.string(), bankAccountId: z.string().nullable().default(null), amount, date: z.iso.date(), kind: z.enum(['profit', 'fee', 'adjustment']) })
export const savedScenarioSchema = base.extend({ startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), startingCash: z.number().finite(), monthlyEmergencySavings: amount, monthlyExtraDebtPayment: amount, hypotheticalTradingMonthly: amount })
export const balanceCorrectionSchema = base.extend({ entityType: z.enum(['debt', 'bank']), entityId: z.string().uuid(), previousAmount: money, nextAmount: money, date: z.iso.date(), reason: z.string().min(1) })
export const settingsSchema = z.object({ theme: z.enum(['light', 'dark']).default('dark'), monthlyEssentialsBuffer: amount.default(0), homeCreditMilestone: z.number().int().min(300).max(850).nullable().default(null), startingCash: z.number().finite().default(0), monthlyEmergencySavings: amount.default(0), monthlyExtraDebtPayment: amount.default(0) })

export const schemas = { members: memberSchema, incomes: incomeSchema, expenses: expenseSchema, debts: debtSchema, payments: paymentSchema, settlements: settlementSchema, savings: savingsSchema, trading: tradingSchema, oneTimeExpenses: oneTimeExpenseSchema, tradingPayouts: tradingPayoutSchema, bankAccounts: bankAccountSchema, incomeTransactions: incomeTransactionSchema, incomeRevisions: incomeRevisionSchema, expenseTransactions: expenseTransactionSchema, bankTransfers: bankTransferSchema, categories: categorySchema, monthlyBudgets: monthlyBudgetSchema, tradingTransactions: tradingTransactionSchema, savedScenarios: savedScenarioSchema, balanceCorrections: balanceCorrectionSchema } as const
export type Collection = keyof typeof schemas
const arrays = Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [key, z.array(schema)])) as { [K in Collection]: z.ZodArray<(typeof schemas)[K]> }
export const backupSchema = z.object({ format: z.literal('goxplan'), version: z.literal(3), exportedAt: z.string(), household: householdSchema, ...arrays, settings: settingsSchema })
const previousKeys = ['members', 'incomes', 'expenses', 'debts', 'payments', 'settlements', 'savings', 'trading', 'oneTimeExpenses', 'tradingPayouts'] as const
const previousArrays = Object.fromEntries(previousKeys.map(key => [key, z.array(schemas[key])]))
const v2BackupSchema = z.object({ format: z.literal('goxplan'), version: z.literal(2), exportedAt: z.string(), ...previousArrays, settings: settingsSchema })
const v1BackupSchema = z.object({ format: z.literal('goxplan'), version: z.literal(1), exportedAt: z.string(), members: z.array(memberSchema), incomes: z.array(incomeSchema), expenses: z.array(expenseSchema), debts: z.array(oldDebtSchema), payments: z.array(paymentSchema), settlements: z.array(oldSettlementSchema), savings: z.array(savingsSchema), trading: z.array(tradingSchema), settings: settingsSchema })
export type Backup = z.infer<typeof backupSchema>
export type Household = z.infer<typeof householdSchema>
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
export type BankAccount = z.infer<typeof bankAccountSchema>
export type Settings = z.infer<typeof settingsSchema>
const now = () => new Date().toISOString()
export const LOCAL_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'
export const emptyBackup = (): Backup => ({ format: 'goxplan', version: 3, exportedAt: now(), household: { id: LOCAL_HOUSEHOLD_ID, name: 'Local household', createdAt: now(), updatedAt: now() }, members: [], incomes: [], expenses: [], debts: [], payments: [], settlements: [], savings: [], trading: [], oneTimeExpenses: [], tradingPayouts: [], bankAccounts: [], incomeTransactions: [], incomeRevisions: [], expenseTransactions: [], bankTransfers: [], categories: [], monthlyBudgets: [], tradingTransactions: [], savedScenarios: [], balanceCorrections: [], settings: settingsSchema.parse({}) })
export function parseBackup(value: unknown): Backup {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid backup')
  if ('version' in value && value.version === 3) return backupSchema.parse({ incomeRevisions: [], ...value })
  const legacyPayType = (rows: Income[]) => rows.map(row => ({ ...row, payType: row.hourlyRate !== null ? 'hourly' as const : row.frequency === 'variable' ? 'variable' as const : 'salaried' as const }))
  if ('version' in value && value.version === 2) { const old = v2BackupSchema.parse(value) as z.infer<typeof v2BackupSchema> & { incomes: Income[] }; return backupSchema.parse({ ...emptyBackup(), ...old, version: 3, incomes: legacyPayType(old.incomes) }) }
  if ('version' in value && value.version === 1) {
    const old = v1BackupSchema.parse(value)
    return backupSchema.parse({ ...emptyBackup(), ...old, version: 3, incomes: legacyPayType(old.incomes), settlements: old.settlements.map(s => ({ ...s, status: s.status === 'paid' && (s.paidAmount ?? 0) >= (s.agreedAmount ?? s.offerAmount ?? Infinity) ? 'completed' : s.status === 'rejected' ? 'expired' : s.status === 'paid' ? 'accepted' : s.status })) })
  }
  throw new Error('Unsupported backup schema version')
}
export const newBase = (name: string) => ({ id: crypto.randomUUID(), name, notes: '', confidence: 'confirmed' as const, createdAt: now(), updatedAt: now() })
