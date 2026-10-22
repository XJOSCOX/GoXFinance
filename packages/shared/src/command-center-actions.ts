import type { CommandAction, CommandCenter } from './command-center'
import type { InsightSources, InsightReport } from './insights'
import type { PlannerReport } from './planner'
import type { ForecastEvent } from './forecasts'
import { forecastAddDays } from './smart-forecast-events'
import { payrollMilestones } from './payroll-schedule'
import type { PayrollProfile } from './payroll'
export function commandDestination(home: string, type: string, id?: string) {
  const base = `/households/${home}/`
  if (type === 'income') return base + 'income'
  if (type === 'payroll') return base + 'income' + (id ? `?payroll=${encodeURIComponent(id)}` : '')
  if (type === 'bill' || type === 'bill_payment' || type === 'bill_period') return base + 'bills'
  if (type.startsWith('debt') || type === 'settlement') return base + 'debts'
  if (type === 'expense') return base + 'expenses'
  return base + 'planner' + (type === 'planner' && id ? `?record=${encodeURIComponent(id)}` : '')
}
export function commandActions(
  home: string,
  s: InsightSources,
  plan: PlannerReport,
  report: InsightReport,
  cash: CommandCenter['cash'],
  paycheck: CommandCenter['paycheck'],
  today: string,
  owner: boolean,
  profiles: PayrollProfile[] = [],
) {
  const actions: CommandAction[] = [],
    seen = new Set<string>()
  const add = (a: CommandAction) => {
    const key = `${a.source.type}:${a.source.id}`
    if (!seen.has(key)) {
      seen.add(key)
      actions.push(a)
    }
  }
  const events = new Map(plan.forecast.events.map((e) => [e.id, e]))
  for (const item of plan.items.filter(
    (i) =>
      i.amountCents !== 0 &&
      (!i.dismissed || !!i.constraint) &&
      i.date <= forecastAddDays(today, 14),
  )) {
    const e = item.sourceEventIds.map((id) => events.get(id)).find(Boolean) as
      ForecastEvent | undefined
    const ref = e?.reference
    const tier = item.constraint
      ? 0
      : ['critical', 'essential'].includes(item.priority) && (item.unfundedCents ?? 0) > 0
        ? 1
        : 2
    add({
      id: 'obligation:' + item.id,
      title: `Review ${item.name}`,
      explanation: item.reason.join(' '),
      tier,
      priority: item.priority,
      source: { type: ref?.type ?? 'planner', id: ref?.parentId ?? ref?.id ?? item.id },
      date: e?.originalDate ?? item.date,
      amountCents: item.amountCents,
      confidence: item.confidence,
      destination: commandDestination(home, ref?.type ?? 'planner', ref?.parentId ?? ref?.id),
      rankingReason:
        tier === 0
          ? 'Verified serious consequence or legal constraint takes precedence.'
          : tier === 1
            ? 'Near-term essential funding gap.'
            : 'Existing obligation due within 14 days.',
    })
  }
  if (cash.status !== 'reported')
    add({
      id: 'confirm-cash',
      title: owner ? 'Confirm available cash' : 'Available cash needs confirmation',
      explanation: cash.explanation,
      tier: 3,
      priority: 'needs_information',
      source: { type: 'missing_cash', id: home },
      date: null,
      amountCents: null,
      confidence: 'unknown',
      destination: `/households/${home}/planner${owner ? '?action=balance' : ''}`,
      rankingReason: 'Missing or stale cash prevents a reliable projection.',
    })
  if (plan.unknownCount)
    add({
      id: 'unknown-obligations',
      title: 'Review unknown obligation amounts',
      explanation: `${plan.unknownCount} obligations have unresolved amounts.`,
      tier: 3,
      priority: 'needs_information',
      source: { type: 'missing_obligations', id: home },
      date: null,
      amountCents: null,
      confidence: 'unknown',
      destination: `/households/${home}/planner`,
      rankingReason: 'Unknown amounts cannot be treated as zero.',
    })
  for (const w of s.payroll ?? []) {
    if ((w.statement && w.reviewedAt) || w.estimateCancelled) continue
    const profile = profiles.find(
      (p) => p.sourceId === w.sourceId && p.milestonesConfigured === true,
    )
    const milestone = profile ? payrollMilestones(w.workweekEnd, profile).statement : null
    if (!milestone || milestone > today) continue
    add({
      id: 'upload:' + w.id,
      title: 'Upload the expected paystub',
      explanation: 'The configured statement milestone has arrived for a reported work period.',
      tier: 4,
      priority: 'review',
      source: { type: 'payroll', id: w.id },
      date: milestone,
      amountCents: null,
      confidence: 'configured',
      destination: `/households/${home}/income?action=upload&payroll=${w.id}`,
      rankingReason: 'Configured payroll milestone; no future hours invented.',
    })
  }
  if (paycheck)
    add({
      id: 'paycheck:' + paycheck.id,
      title:
        paycheck.status === 'reviewed'
          ? 'Confirm paycheck received when deposited'
          : 'Prepare for the next paycheck',
      explanation: `${paycheck.employer}: ${paycheck.status === 'reviewed' ? 'reviewed paystub; receipt remains unconfirmed' : 'saved estimate, conditional until received'}.`,
      tier: 4,
      priority: 'review',
      source: { type: 'payroll', id: paycheck.id },
      date: paycheck.date,
      amountCents: paycheck.netCents,
      confidence: paycheck.confidence,
      destination: paycheck.destination,
      rankingReason: 'Existing payroll period and supported deposit date.',
    })
  for (const insight of report.insights) {
    const obligation =
      insight.type === 'essential_gap'
        ? actions.find((a) => a.id === 'obligation:' + insight.id.slice('essential-gap:'.length))
        : undefined
    if (obligation) {
      obligation.tier = obligation.tier === 0 ? 0 : 1
      obligation.explanation +=
        cash.status === 'reported'
          ? ' Smart Planner identifies an essential funding gap.'
          : ' Cash needs confirmation; funding depends on saved planning assumptions.'
      obligation.rankingReason =
        obligation.tier === 0
          ? obligation.rankingReason
          : 'Near-term essential funding gap, identified by Smart Planner and Financial Insights.'
      continue
    }
    const ref = insight.refs.find((r) => r.type !== 'forecast_settings') ?? insight.refs[0]
    if (!ref) continue
    const significant = ['urgent', 'important'].includes(insight.priority)
    add({
      id: 'insight:' + insight.id,
      title: insight.title,
      explanation:
        cash.status !== 'reported' && insight.area === 'cash_flow'
          ? 'Cash needs confirmation; review these conditional planning assumptions. ' +
            insight.explanation
          : insight.explanation,
      tier: significant && insight.area === 'cash_flow' ? 1 : insight.area === 'debt' ? 6 : 5,
      priority: insight.priority,
      source: { type: ref.type, id: ref.id },
      date: ref.date ?? null,
      amountCents:
        cash.status !== 'reported' &&
        (insight.type === 'essential_gap' || insight.type.startsWith('cash_'))
          ? null
          : insight.currentCents,
      confidence: insight.confidence,
      destination: `/households/${home}/insights?insight=${encodeURIComponent(insight.id)}`,
      rankingReason:
        'Current authorized Financial Insights evidence; essential constraints remain first.',
    })
  }
  const confidence = (v: string) =>
    v === 'confirmed' || v === 'high' ? 0 : v === 'estimated' || v === 'medium' ? 1 : 2
  return actions.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
      confidence(a.confidence) - confidence(b.confidence) ||
      a.id.localeCompare(b.id),
  )
}
