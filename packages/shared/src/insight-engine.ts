import type { InsightSources, InsightReport, InsightMetric, Insight, InsightRef } from './insights'
import type { ForecastInput } from './forecasts'
import { spendingInsights, spendingEvidence } from './insight-spending'
import { incomeInsights } from './insight-income'
import { debtInsights } from './insight-debt'
import { cashInsights } from './insight-cash'
import { insightPeriods, roundedRatio } from './insight-statistics'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { budgetFromBills } from './budget-planning'
import { sumCents } from './outflows'
import { netWorth } from './net-worth'
import { insightPriorities } from './insights'
/** Read-only composition. No financial records, balances or schedules are mutated. */
export function financialInsights(
  s: InsightSources,
  input: ForecastInput,
  now: string,
  localToday = now.slice(0, 10),
): InsightReport {
  const today = localToday,
    window = insightPeriods(today),
    insights: Insight[] = [],
    emit = (i: Insight) => insights.push(i),
    metrics: InsightMetric[] = []
  const metric = (m: InsightMetric) => metrics.push(m)
  spendingInsights(s, today, emit)
  incomeInsights(s, today, emit)
  debtInsights(s, today, emit)
  const plan = cashInsights(s, input, today, emit),
    forecast = plan.forecast
  const forecastRefs: InsightRef[] = [
    ...(s.settingsId
      ? [{ type: 'forecast_settings' as const, id: s.settingsId, date: today }]
      : []),
    ...forecast.events.flatMap((e) => {
      const r = e.reference
      if (!r || r.type === 'scenario') return []
      const type = r.type === 'bill_payment' ? 'bill' : r.type === 'debt_payment' ? 'debt' : r.type
      return [{ type, id: r.parentId ?? r.id, date: e.date }]
    }),
  ]
  const received = s.income.transactions.filter(
    (t) =>
      t.status === 'confirmed' &&
      t.depositDate?.startsWith(today.slice(0, 7)) &&
      t.depositDate <= today,
  )
  const net =
    received.length && received.every((t) => t.actualNetCents !== null)
      ? sumCents(received.map((t) => t.actualNetCents!))
      : null
  const incomeRefs = received.map((t) => ({
    type: 'income' as const,
    id: t.id,
    date: t.depositDate!,
  }))
  metric({
    key: 'confirmed_income',
    label: 'Received take-home · month to date',
    value: net,
    unit: 'cents',
    sampleCount: received.length,
    refs: incomeRefs,
    basis:
      'Confirmed deposits in the current calendar month through today; no forecast, borrowing or trading P&L.',
  })
  const obligations = budgetFromBills(s.bills, s.categories, today.slice(0, 7), null).rows
  const essential = obligations.filter((row) => {
    const b = s.bills.find((b) => b.id === row.billId)!,
      category = s.categories.find((c) => c.id === b.categoryId)
    return (
      /housing|utilit|health|transport|child|grocer/i.test(category?.name ?? '') ||
      s.planner?.records.some(
        (r) =>
          r.values.kind === 'priority' &&
          r.values.verification.verified &&
          r.values.essential &&
          r.values.target.id === b.id,
      )
    )
  })
  const essentialTotal =
    essential.length && essential.every((r) => r.amountCents !== null)
      ? sumCents(essential.map((r) => r.amountCents!))
      : null
  const billRefs = essential.map((r) => ({ type: 'bill' as const, id: r.billId, date: r.dueDate }))
  metric({
    key: 'essential_obligations',
    label: 'Essential bills · this month',
    value: essentialTotal,
    unit: 'cents',
    sampleCount: essential.length,
    refs: billRefs,
    basis:
      'Configured essential category names or verified Planner essential priorities; whole calendar month, saved estimates included. Categories are not proof of complete coverage.',
  })
  const groups = debtObligationGroups(s.debts),
    known = groups.filter((g) => g.some((d) => d.minimumPaymentCents !== null))
  const minimum = known.length
    ? sumCents(known.map((g) => Math.max(...g.map((d) => d.minimumPaymentCents ?? 0))))
    : null
  const debtRefs = groups.map((g) => {
    const d = representativeDebtBalance(g)
    return { type: 'debt' as const, id: d.id, date: d.updatedAt.slice(0, 10) }
  })
  metric({
    key: 'debt_minimums',
    label: 'Known monthly debt minimums',
    value: minimum,
    unit: 'cents',
    sampleCount: known.length,
    refs: debtRefs,
    basis: `One maximum reported minimum per verified duplicate group; ${groups.length - known.length} groups have unknown minimums. Linked bill repayments are not added again.`,
  })
  // Comparing a full-month minimum to partial-month deposits is explicitly a planning pressure indicator, not conventional gross-income DTI.
  metric({
    key: 'net_debt_pressure',
    label: 'Minimums / received MTD take-home',
    value:
      minimum !== null && net !== null && known.length === groups.length
        ? roundedRatio(minimum, net, 10000)
        : null,
    unit: 'bps',
    sampleCount: known.length + received.length,
    refs: [...debtRefs, ...incomeRefs],
    basis:
      'Full-month known minimums / confirmed month-to-date NET deposits. Partial month denominator; not conventional gross monthly DTI. Unknown minimums invalidate ratio.',
  })
  const discretionary = s.categories.filter((c) =>
      /dining|entertain|shopping|subscription|travel/i.test(c.name),
    ),
    spending = discretionary.map((c) => spendingEvidence(s, window.from, window.through, c.id)),
    observed = spending.filter((c) => c.cents !== null)
  metric({
    key: 'discretionary',
    label: 'Recorded discretionary spending',
    value: observed.length ? sumCents(observed.map((c) => c.cents!)) : null,
    unit: 'cents',
    sampleCount: observed.reduce((a, c) => a + c.count, 0),
    refs: observed.flatMap((c) => c.refs),
    basis:
      'Category-name classification; net purchase spending in the comparison window. Transfers/repayments excluded; missing category history is unknown.',
  })
  const allSpend = spendingEvidence(s, window.from, window.through)
  const windowReceived = received.filter((t) => t.depositDate! <= window.through)
  const windowNet =
    windowReceived.length && windowReceived.every((t) => t.actualNetCents !== null)
      ? sumCents(windowReceived.map((t) => t.actualNetCents!))
      : null
  metric({
    key: 'spend_income',
    label: 'Purchases / received take-home',
    value:
      allSpend.cents !== null && windowNet !== null
        ? roundedRatio(allSpend.cents, windowNet, 10000)
        : null,
    unit: 'bps',
    sampleCount: allSpend.count + windowReceived.length,
    refs: [
      ...allSpend.refs,
      ...windowReceived.map((t) => ({ type: 'income' as const, id: t.id, date: t.depositDate! })),
    ],
    basis:
      'Recorded net purchases / confirmed deposits in the same comparison window; not a saving rate or proof of complete cash coverage.',
  })
  const expected = forecast.events.filter(
      (e) => e.direction === 'in' && e.classification !== 'borrowed_cash',
    ),
    expectedNet =
      expected.length && expected.every((e) => e.amountCents !== null)
        ? sumCents(expected.map((e) => e.amountCents!))
        : null
  metric({
    key: 'expected_allocated',
    label: 'Obligations / conditional inflows · 90 days',
    value:
      !forecast.incomplete && expectedNet !== null
        ? roundedRatio(forecast.outflowCents, expectedNet, 10000)
        : null,
    unit: 'bps',
    sampleCount: forecast.events.length,
    refs: forecastRefs,
    basis:
      'Forecast scheduled/estimated outflows / modeled nonborrowed inflows in the same horizon. Conditional, not deposited cash; missing amounts invalidate ratio.',
  })
  metric({
    key: 'cash_floor',
    label: 'Projected minimum cash · 90 days',
    value: forecast.incomplete ? null : forecast.lowestCents,
    unit: 'cents',
    sampleCount: forecast.days.length,
    refs: forecastRefs,
    basis:
      'Existing Smart Planner forecast including dated opening cash, arrangements and reserves. Missing opening/amounts keep this unknown.',
  })
  metric({
    key: 'savings_progress',
    label: 'Verified achieved savings',
    value: null,
    unit: 'cents',
    sampleCount: 0,
    refs: [],
    basis:
      'Not independently established. Goal contributions and accepted action plans do not prove money saved.',
  })
  const savings = (s.cashAccounts ?? []).filter(
    (a) =>
      a.status === 'active' &&
      a.type === 'savings' &&
      a.currency === 'USD' &&
      a.balance &&
      a.balance.observedAt.slice(0, 10) === today &&
      Date.parse(a.balance.observedAt) <= Date.parse(now) &&
      a.balance.availableCents !== null,
  )
  // Never sum accounts here: overlapping identity, duplicated assets and incompatible timestamps require explicit confirmation elsewhere.
  const one = savings.length === 1 ? savings[0] : null
  metric({
    key: 'emergency_coverage',
    label: 'Reported savings coverage · days',
    value:
      one && essentialTotal !== null
        ? roundedRatio(Math.max(0, one.balance!.availableCents!), essentialTotal, 30)
        : null,
    unit: 'days',
    sampleCount: savings.length,
    refs: one ? [{ type: 'bank_balance', id: one.balance!.id, date: today, parentId: one.id }] : [],
    basis:
      'One same-day USD savings available balance / configured monthly essential bills × 30. User-reported/cached, not verified emergency funds; multiple accounts require explicit nonoverlap confirmation and are not summed.',
  })
  if (s.assets) {
    const worth = netWorth(s.assets, today, null, today),
      refs = [
        ...worth.assets.map((a) => ({
          type: 'asset' as const,
          id: a.id,
          date: a.valuationDate ?? today,
        })),
        ...debtRefs,
      ]
    metric({
      key: 'recorded_net_worth',
      label: 'Recorded net worth · estimates included',
      value:
        !worth.incomplete && (worth.assets.length > 0 || worth.liabilities.length > 0)
          ? worth.subtotalCents
          : null,
      unit: 'cents',
      sampleCount: worth.assets.length + worth.liabilities.length,
      refs,
      basis:
        'Existing assets/net-worth calculation, recorded valuations minus grouped liabilities as of today. Estimates are not cash or verified achieved savings; incomplete values stay unknown.',
    })
  }
  const emphasis = (i: Insight) =>
    i.type === 'essential_gap'
      ? 0
      : i.type === 'settlement_deadline'
        ? 1
        : i.area === 'cash_flow'
          ? 2
          : i.area === 'debt'
            ? 3
            : 4
  const unknown = metrics.some((m) => m.value === null)
  return {
    schemaVersion: 1,
    evaluatedAt: now,
    ...window,
    privacyLimited: !!s.privacyLimited,
    status: insights.some((i) => i.priority === 'urgent' || i.priority === 'important')
      ? 'pressure'
      : unknown
        ? 'needs_information'
        : 'within_observed_plan',
    metrics,
    insights: insights.sort(
      (a, b) =>
        insightPriorities.indexOf(a.priority) - insightPriorities.indexOf(b.priority) ||
        emphasis(a) - emphasis(b) ||
        a.id.localeCompare(b.id),
    ),
    coverage: [
      'No composite score: recorded indicators may be incomplete.',
      'Current totals refresh from source records. Saved action context remains historical.',
      'Cash risk uses a 90-day conditional projection; trends require their stated minimum samples.',
      ...forecast.warnings,
      ...(s.privacyLimited
        ? [
            'Only records authorized for your member scope are included; this is not a complete household total.',
          ]
        : []),
    ],
  }
}
