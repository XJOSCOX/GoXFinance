import { z } from 'zod'
const money = z.number().int().safe()
const amount = money.nullable()
export const commandModules = [
  'upload',
  'estimate',
  'balance',
  'bills',
  'debts',
  'planner',
  'insights',
  'budgets',
] as const
export const commandPreferencesSchema = z
  .object({
    periodDays: z.union([z.literal(14), z.literal(30)]).default(14),
    compact: z.boolean().default(true),
    expanded: z
      .array(z.enum(['timeline', 'progress', 'insights', 'allocations']))
      .max(4)
      .default(['insights']),
    quickActions: z
      .array(z.enum(commandModules))
      .max(8)
      .default(['upload', 'estimate', 'balance', 'planner']),
    indicators: z
      .array(z.enum(['income', 'budget', 'goals', 'debt']))
      .max(4)
      .default(['income', 'budget', 'goals']),
  })
  .strict()
export type CommandPreferences = z.infer<typeof commandPreferencesSchema>
const source = z.object({ type: z.string(), id: z.string() })
const action = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  tier: z.number().int().min(0).max(6),
  priority: z.string(),
  source,
  date: z.string().nullable(),
  amountCents: amount,
  confidence: z.string(),
  destination: z.string(),
  rankingReason: z.string(),
})
const obligation = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  planningDate: z.string(),
  amountCents: amount,
  paidCents: amount,
  remainingCents: amount,
  priority: z.string(),
  reservedCents: money,
  unfundedCents: amount,
  confidence: z.string(),
  source,
  destination: z.string(),
  explanation: z.string(),
})
export const commandCenterSchema = z.object({
  schemaVersion: z.literal(1),
  evaluatedAt: z.string(),
  today: z.string(),
  month: z.string(),
  privacyLimited: z.boolean(),
  canManage: z.boolean(),
  owner: z.boolean(),
  preferences: commandPreferencesSchema,
  preferenceRevision: z.number().int(),
  cash: z.object({
    amountCents: amount,
    lastReportedCents: amount,
    effectiveAt: z.string().nullable(),
    source: z.string().nullable(),
    status: z.enum(['missing', 'stale', 'needs_confirmation', 'reported']),
    explanation: z.string(),
  }),
  paycheck: z
    .object({
      id: z.string(),
      employer: z.string(),
      date: z.string(),
      originalDate: z.string().nullable(),
      netCents: amount,
      grossCents: amount,
      workedHundredths: amount,
      periodStart: z.string().nullable(),
      periodEnd: z.string().nullable(),
      confidence: z.string(),
      status: z.enum(['estimated', 'reviewed']),
      destination: z.string(),
    })
    .nullable(),
  essential: z.array(
    z.object({ days: z.number(), knownCents: money, count: z.number(), unknownCount: z.number() }),
  ),
  projection: z.object({
    through: z.string(),
    lowestCents: amount,
    endingCents: amount,
    bufferCents: amount,
    status: z.string(),
    gapCents: amount,
    reservedCents: amount,
    fundedEssentialCents: money,
    unfundedEssentialCents: money,
    unknownCount: z.number(),
    incomplete: z.boolean(),
  }),
  accounting: z.object({
    receivedCents: money,
    expectedCents: amount,
    knownExpectedCents: money,
    expectedUnknownCount: z.number().int().nonnegative(),
    cashPaidCents: money,
    spendingCents: money,
    netCashFlowCents: money,
    confirmedCount: z.number(),
  }),
  actions: z.array(action),
  omittedActionCount: z.number(),
  obligations: z.array(obligation),
  obligationCount: z.number(),
  allocation: z.object({
    amountCents: amount,
    allocatedCents: money,
    remainingCents: amount,
    heldCents: amount,
    rows: z.array(
      z.object({ id: z.string(), name: z.string(), amountCents: money, priority: z.string() }),
    ),
  }),
  timeline: z.array(
    z.object({
      date: z.string(),
      cashCents: amount,
      belowBuffer: z.boolean(),
      events: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          amountCents: amount,
          direction: z.enum(['in', 'out']),
          status: z.string(),
          source: source.nullable(),
          destination: z.string(),
        }),
      ),
    }),
  ),
  insights: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      explanation: z.string(),
      priority: z.string(),
      confidence: z.string(),
      amountCents: amount,
      destination: z.string(),
      dismissed: z.boolean(),
    }),
  ),
  budget: z.object({
    allocationCents: amount,
    assignedCents: amount,
    unallocatedCents: amount,
    actualCents: money,
  }),
  goals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      actualCents: amount,
      targetCents: money,
      source: z.string(),
      incomplete: z.boolean(),
    }),
  ),
  debtChanges: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      from: z.string(),
      through: z.string(),
      currentCents: money,
      previousCents: money,
      destination: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
})
export type CommandCenter = z.infer<typeof commandCenterSchema>
export type CommandAction = z.infer<typeof action>
