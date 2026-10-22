import { commandCenterSchema, type CommandCenter, type CommandPreferences } from './command-center'
import { commandActions, commandDestination } from './command-center-actions'
import type { InsightSources, InsightReport } from './insights'
import type { ForecastInput } from './forecasts'
import type { PlannerReport } from './planner'
import type { PayrollProfile } from './payroll'
import { forecastAddDays, availableCashAccounts } from './smart-forecast-events'
import { incomeSummary } from './income-calculations'
import { cashOutflows, sumCents } from './outflows'
import { budgetSpending } from './budget-calculations'
export function commandCenterSummary(
  s: InsightSources,
  plan: PlannerReport,
  insights: InsightReport,
  input: ForecastInput,
  options: {
    home: string
    today: string
    now: string
    month: string
    owner: boolean
    canManage: boolean
    preferences: CommandPreferences
    preferenceRevision: number
    profiles?: PayrollProfile[]
  },
): CommandCenter {
  const { home, today, now, month, owner, canManage, preferences, preferenceRevision } = options
  const opening = input.smart?.opening,
    age = opening ? Date.parse(now) - Date.parse(opening.effectiveAt) : null
  const eligibleCashAccounts = availableCashAccounts(s, now)
  const selectedChanged =
    opening?.source === 'selected_accounts' &&
    opening.accounts.some(
      (a) =>
        !eligibleCashAccounts.some(
          (b) =>
            b.id === a.accountId &&
            b.balance?.id === a.balanceId &&
            b.balance.availableCents === a.availableCents,
        ),
    )
  const stale = age !== null && age > 86400000
  const cash: CommandCenter['cash'] = {
    amountCents: opening && !stale && !selectedChanged && age! >= 0 ? opening.amountCents : null,
    lastReportedCents: opening?.amountCents ?? null,
    effectiveAt: opening?.effectiveAt ?? null,
    source: opening?.source ?? null,
    status: !opening
      ? 'missing'
      : stale
        ? 'stale'
        : selectedChanged || age! < 0
          ? 'needs_confirmation'
          : 'reported',
    explanation: !opening
      ? 'Confirm dated available cash in Smart Planner. Income received is not a bank balance.'
      : stale
        ? 'The cash confirmation is over 24 hours old. Reconfirm cash before relying on projected balances.'
        : selectedChanged
          ? 'A selected account balance changed, is stale or is no longer eligible. Reconfirm the combined cash snapshot.'
          : 'User-reported dated cash, not a live bank-verified balance.',
  }
  const reliable = cash.status === 'reported' && !plan.forecast.incomplete
  const forecast = plan.forecast,
    eventMap = new Map(forecast.events.map((e) => [e.id, e]))
  const next = forecast.events.find((e) => e.kind === 'expected_income' && e.estimated)
  const w =
    next?.reference?.type === 'payroll'
      ? s.payroll?.find((w) => w.id === next.reference!.id)
      : undefined
  const paycheck: CommandCenter['paycheck'] = next
    ? {
        id: w?.id ?? next.id,
        employer: next.name,
        date: next.date,
        originalDate: next.originalDate ?? null,
        netCents: next.amountCents,
        grossCents: next.grossCents ?? null,
        workedHundredths:
          w?.statement?.reportedWorkedHundredths ??
          w?.forecasts.at(-1)?.result.workedHundredths ??
          null,
        periodStart: w?.workweekStart ?? next.workPeriod?.start ?? null,
        periodEnd: w?.workweekEnd ?? next.workPeriod?.end ?? null,
        confidence: next.confidence ?? 'unknown',
        status: w?.statement && w.reviewedAt ? 'reviewed' : 'estimated',
        destination: commandDestination(home, w ? 'payroll' : 'income', w?.id),
      }
    : null
  const items = plan.items.filter((i) => i.amountCents !== 0)
  const obligations: CommandCenter['obligations'] = items.map((i) => {
    const e = i.sourceEventIds.map((id) => eventMap.get(id)).find(Boolean),
      ref = e?.reference
    const bill = s.bills.find((b) => b.id === (ref?.parentId ?? ref?.id)),
      period = bill?.periods.find((p) => p.dueDate === (e?.originalDate ?? i.date))
    return {
      id: i.id,
      name: i.name,
      date: e?.originalDate ?? i.date,
      planningDate: i.date,
      amountCents: period
        ? (period.amountCents ??
          period.estimatedAmountCents ??
          period.budgetEstimateCents ??
          i.amountCents)
        : i.amountCents,
      paidCents: period?.paidCents ?? null,
      remainingCents: i.amountCents,
      priority: i.priority,
      reservedCents: i.recommendedCents,
      unfundedCents: i.unfundedCents,
      confidence: i.confidence,
      source: { type: ref?.type ?? 'planner', id: ref?.parentId ?? ref?.id ?? i.id },
      destination: commandDestination(home, ref?.type ?? 'planner', ref?.parentId ?? ref?.id),
      explanation: i.reason.join(' '),
    }
  })
  const essentials = items.filter((i) => ['critical', 'essential'].includes(i.priority))
  const essential = [7, 14].map((days) => {
    const chosen = essentials.filter((i) => i.date <= forecastAddDays(today, days - 1))
    return {
      days,
      knownCents: sumCents(chosen.map((i) => i.amountCents ?? 0)),
      count: chosen.length,
      unknownCount: chosen.filter((i) => i.amountCents === null).length,
    }
  })
  const received = incomeSummary(s.income.transactions, month, today)
  const out = cashOutflows(
    s.expenses,
    s.bills.flatMap((b) => b.payments),
    s.payments,
    today,
    s.refunds,
  ).filter((t) => t.date.startsWith(month))
  const paid = sumCents(out.map((t) => t.cashOutflowCents)),
    spent = sumCents(out.map((t) => t.spendingCents))
  const budgets = (s.budgets ?? []).filter(
    (b) => b.month === month && b.status === 'active' && (!owner || b.responsibleMemberId === null),
  )
  const budget = budgets.length === 1 ? budgets[0] : null,
    assigned = budget ? sumCents(budget.limits.map((l) => l.amountCents)) : null
  const budgetActual = sumCents(
    budgetSpending(s.expenses, s.bills, month, null, today, s.refunds).map((r) => r.actualCents),
  )
  const funding =
    next?.amountCents !== null ? plan.funding.find((f) => f.id === next?.id) : undefined
  const rows = funding
    ? items.flatMap((i) =>
        i.funding
          .filter((f) => f.id === funding.id)
          .map((f) => ({
            id: i.id,
            name: i.name,
            amountCents: f.amountCents,
            priority: i.priority,
          })),
      )
    : []
  const allocated = sumCents(rows.map((r) => r.amountCents))
  const actions = commandActions(
    home,
    s,
    plan,
    insights,
    cash,
    paycheck,
    today,
    owner,
    options.profiles,
  )
  return commandCenterSchema.parse({
    schemaVersion: 1,
    evaluatedAt: now,
    today,
    month,
    privacyLimited: s.privacyLimited ?? false,
    canManage,
    owner,
    preferences,
    preferenceRevision,
    cash,
    paycheck,
    essential,
    projection: {
      through: input.endDate,
      lowestCents: reliable ? forecast.lowestCents : null,
      endingCents: reliable ? forecast.endingCents : null,
      bufferCents: input.smart?.bufferCents ?? null,
      status: !reliable ? 'needs_confirmation' : (forecast.smart?.health ?? 'needs_information'),
      gapCents: cash.status === 'reported' ? plan.unfundedCents : null,
      reservedCents: input.smart ? plan.reservedCents : null,
      fundedEssentialCents: sumCents(essentials.map((i) => i.recommendedCents)),
      unfundedEssentialCents: sumCents(essentials.map((i) => i.unfundedCents ?? 0)),
      unknownCount: plan.unknownCount,
      incomplete: !reliable,
    },
    accounting: {
      receivedCents: received.confirmedCents,
      expectedCents: forecast.events.some(
        (e) => e.kind === 'expected_income' && e.amountCents === null,
      )
        ? null
        : sumCents(
            forecast.events.filter((e) => e.kind === 'expected_income').map((e) => e.amountCents!),
          ),
      knownExpectedCents: sumCents(
        forecast.events.filter((e) => e.kind === 'expected_income').map((e) => e.amountCents ?? 0),
      ),
      expectedUnknownCount: forecast.events.filter(
        (e) => e.kind === 'expected_income' && e.amountCents === null,
      ).length,
      cashPaidCents: paid,
      spendingCents: spent,
      netCashFlowCents: sumCents([received.confirmedCents, -paid]),
      confirmedCount: s.income.transactions.filter(
        (t) =>
          t.status === 'confirmed' && t.depositDate?.startsWith(month) && t.depositDate <= today,
      ).length,
    },
    actions: actions.slice(0, 100),
    omittedActionCount: Math.max(0, actions.length - 100),
    obligations: obligations
      .sort(
        (a, b) =>
          Number(a.date > forecastAddDays(today, 13)) -
            Number(b.date > forecastAddDays(today, 13)) ||
          a.date.localeCompare(b.date) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 40),
    obligationCount: items.length,
    allocation: {
      amountCents: funding?.amountCents ?? null,
      allocatedCents: allocated,
      remainingCents: funding?.remainingCents ?? null,
      heldCents: funding
        ? Math.max(0, sumCents([funding.amountCents, -allocated, -funding.remainingCents]))
        : null,
      rows,
    },
    timeline: forecast.days.slice(0, 30).map((d) => ({
      date: d.date,
      cashCents: reliable ? d.cashCents : null,
      belowBuffer:
        reliable && d.cashCents !== null && d.cashCents < (input.smart?.bufferCents ?? 0),
      events: forecast.events
        .filter((e) => e.date === d.date)
        .map((e) => ({
          id: e.id,
          name: e.name,
          amountCents: e.amountCents,
          direction: e.direction,
          status:
            e.amountCents === null
              ? 'unknown'
              : !e.estimated
                ? 'confirmed'
                : ['pending', 'scheduled'].includes(e.kind)
                  ? 'scheduled'
                  : e.direction === 'in'
                    ? 'conditional'
                    : 'estimated',
          source: e.reference
            ? { type: e.reference.type, id: e.reference.parentId ?? e.reference.id }
            : null,
          destination: commandDestination(
            home,
            e.reference?.type ?? 'planner',
            e.reference?.parentId ?? e.reference?.id,
          ),
        })),
    })),
    insights: insights.insights.slice(0, 3).map((i) => ({
      id: i.id,
      title: i.title,
      explanation:
        cash.status !== 'reported' && i.area === 'cash_flow'
          ? 'Cash needs confirmation; these are conditional risks from saved planning assumptions. ' +
            i.explanation
          : i.explanation,
      priority: i.priority,
      confidence:
        cash.status !== 'reported' && i.area === 'cash_flow' ? 'needs_confirmation' : i.confidence,
      amountCents:
        cash.status !== 'reported' && (i.type === 'essential_gap' || i.type.startsWith('cash_'))
          ? null
          : i.currentCents,
      destination: `/households/${home}/insights?insight=${encodeURIComponent(i.id)}`,
      dismissed: i.feedback === 'dismissed',
    })),
    budget: {
      allocationCents: budget?.totalCents ?? null,
      assignedCents: assigned,
      unallocatedCents:
        budget && assigned !== null ? sumCents([budget.totalCents, -assigned]) : null,
      actualCents: budgetActual,
    },
    goals: (s.planner?.goals ?? [])
      .filter((g) => g.status === 'active')
      .slice(0, 8)
      .map((g) => ({
        id: g.id,
        name: g.name,
        actualCents: g.progress.actualCents,
        targetCents: g.targetCents,
        source: g.progress.source,
        incomplete: g.progress.incomplete,
      })),
    debtChanges: insights.insights
      .filter(
        (i) =>
          i.type === 'verified_debt_trend' && i.currentCents !== null && i.comparisonCents !== null,
      )
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        name: i.title,
        from: i.from,
        through: i.through,
        currentCents: i.currentCents,
        previousCents: i.comparisonCents,
        destination: `/households/${home}/insights?insight=${encodeURIComponent(i.id)}`,
      })),
    warnings: [...new Set([cash.explanation, ...plan.warnings, ...insights.coverage])].slice(0, 20),
  })
}
