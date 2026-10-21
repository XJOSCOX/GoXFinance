import type { ForecastReport, ForecastInput } from './forecasts'
import type { ForecastRisk } from './smart-forecast-settings'
import { sumCents } from './outflows'
import { forecastNotices } from './forecast-warnings'
export function enrichSmartForecast(report: ForecastReport, v: ForecastInput): ForecastReport {
  const smart = v.smart!,
    buffer = smart.bufferCents,
    risks: ForecastRisk[] = [],
    next =
      report.events.find(
        (e) => e.direction === 'in' && e.estimated && e.kind === 'expected_income',
      ) ?? null
  const confidence = report.incomplete ? ('incomplete' as const) : ('estimated' as const)
  const outBefore = report.events.filter(
      (e) =>
        e.direction === 'out' &&
        [
          'bill',
          'debt_repayment',
          'pending',
          'scheduled',
          'settlement',
          'installment',
          'advance_repayment',
        ].includes(e.kind) &&
        (!next || e.date < next.date),
    ),
    before = sumCents(outBefore.map((e) => e.amountCents ?? 0)),
    unknownBefore = outBefore.some((e) => e.amountCents === null)
  let below = 0
  const days = report.days.map((d, i) => {
    const events = report.events.filter((e) => e.date === d.date),
      out = events.filter((e) => e.direction === 'out'),
      total = sumCents(out.map((e) => e.amountCents ?? 0)),
      balance = d.knownSubtotalCents
    if (balance !== null && balance < 0)
      risks.push({
        id: 'negative:' + d.date,
        date: d.date,
        amountCents: -balance,
        kind: 'negative',
        reason:
          'Known projected cash falls below zero under these assumptions; this is not a guaranteed overdraft.',
        confidence,
        eventIds: (events.length ? events : report.events.filter((e) => e.date <= d.date)).map(
          (e) => e.id,
        ),
        actions: [
          'Review payment dates and amounts',
          'Confirm expected deposit timing',
          'Compare a smaller-paycheck scenario',
        ],
      })
    if (balance !== null && balance < buffer) {
      below++
      if (
        !i ||
        report.days[i - 1].knownSubtotalCents === null ||
        report.days[i - 1].knownSubtotalCents! >= buffer
      )
        risks.push({
          id: 'buffer:' + d.date,
          date: d.date,
          amountCents: buffer - balance,
          kind: 'buffer',
          reason:
            'Known projected cash first falls below the planning buffer. The buffer is not an expense.',
          confidence,
          eventIds: events.map((e) => e.id),
          actions: [
            'Review optional spending assumptions',
            'Check upcoming obligations and deposit dates',
          ],
        })
    }
    if (out.filter((e) => e.amountCents !== 0).length >= 3)
      risks.push({
        id: 'concentration:' + d.date,
        date: d.date,
        amountCents: total,
        kind: 'concentration',
        reason: 'Three or more outgoing obligations are concentrated on this date.',
        confidence,
        eventIds: out.map((e) => e.id),
        actions: [
          'Review timing with the relevant providers',
          'Simulate postponing an optional payment',
        ],
      })
    const opening = i ? report.days[i - 1].knownSubtotalCents : (smart.opening?.amountCents ?? null)
    if (opening !== null && total > Math.max(0, opening) * 0.5 && total > 0)
      risks.push({
        id: 'large:' + d.date,
        date: d.date,
        amountCents: total,
        kind: 'large_outflow',
        reason:
          'Known outflows exceed half of the known cash entering this day; intraday order is not verified.',
        confidence,
        eventIds: out.map((e) => e.id),
        actions: [
          'Confirm amounts and same-day payment timing',
          'Review expected income availability',
        ],
      })
    const payday = report.events.find(
      (e) => e.direction === 'in' && e.kind === 'expected_income' && e.date >= d.date,
    )
    return {
      ...d,
      openingCents: opening,
      confirmedInCents: sumCents(
        events.filter((e) => e.direction === 'in' && !e.estimated).map((e) => e.amountCents ?? 0),
      ),
      expectedInCents: sumCents(
        events.filter((e) => e.direction === 'in' && e.estimated).map((e) => e.amountCents ?? 0),
      ),
      scheduledOutCents: sumCents(
        out.filter((e) => ['pending', 'scheduled'].includes(e.kind)).map((e) => e.amountCents ?? 0),
      ),
      estimatedOutCents: sumCents(
        out
          .filter(
            (e) =>
              !['pending', 'scheduled'].includes(e.kind) && !e.id.startsWith('variable-spending:'),
          )
          .map((e) => e.amountCents ?? 0),
      ),
      allowanceCents: sumCents(
        out.filter((e) => e.id.startsWith('variable-spending:')).map((e) => e.amountCents ?? 0),
      ),
      daysUntilPaycheck: payday
        ? Math.round((Date.parse(payday.date) - Date.parse(d.date)) / 86400000)
        : null,
    }
  })
  if (outBefore.length)
    risks.push({
      id: 'before-payday',
      date: outBefore[0].date,
      amountCents: unknownBefore ? null : before,
      kind: 'before_payday',
      reason: next
        ? 'Obligations are due before the next expected paycheck.'
        : 'Obligations are due but no next paycheck date is available.',
      confidence,
      eventIds: outBefore.map((e) => e.id),
      actions: ['Confirm the next deposit date', 'Review bills due before payday'],
    })
  for (const e of report.events.filter(
    (e) => e.direction === 'in' && e.estimated && e.originalDate && e.date > e.originalDate,
  ))
    risks.push({
      id: 'delayed:' + e.id,
      date: e.date,
      amountCents: e.amountCents,
      kind: 'delayed_payroll',
      reason:
        'An expected paycheck is delayed or its original date has passed. Its arrival remains an estimate.',
      confidence,
      eventIds: [e.id],
      actions: [
        'Confirm the arrival date with the employer',
        'Compare the effect of a further delay',
      ],
    })
  for (const e of report.events.filter((e) => e.amountCents === null))
    risks.push({
      id: 'missing:' + e.id,
      date: e.date,
      amountCents: null,
      kind: 'missing',
      reason: `Amount unknown: ${e.name}. It is excluded from the known subtotal, not treated as zero.`,
      confidence: 'incomplete',
      eventIds: [e.id],
      actions: [
        'Review the linked record',
        'Confirm the amount before relying on cash availability',
      ],
    })
  const blocking = forecastNotices(report).filter((n) => n.severity === 'blocking')
  if (blocking.length)
    risks.push({
      id: 'missing-context',
      date: v.startDate,
      amountCents: null,
      kind: 'missing',
      reason: blocking.map((n) => n.message).join(' '),
      confidence: 'incomplete',
      eventIds: [],
      actions: ['Review missing dates, amounts or cash timing', 'Confirm opening cash if needed'],
    })
  return {
    ...report,
    days,
    smart: {
      openingRequired: !smart.opening,
      openingEffectiveAt: smart.opening?.effectiveAt ?? null,
      bufferCents: buffer,
      daysBelowBuffer: below,
      risks,
      nextPaycheck: next,
      billsBeforePaydayCents: before,
      unknownBeforePayday: unknownBefore,
      availableAfterObligationsCents:
        !smart.opening || unknownBefore || report.incomplete
          ? null
          : (report.days.filter((day) => !next || day.date < next.date).at(-1)
              ?.knownSubtotalCents ?? smart.opening.amountCents),
      health:
        !smart.opening || report.incomplete
          ? 'needs_information'
          : report.shortfalls.length
            ? 'potential_shortfall'
            : below
              ? 'below_buffer'
              : 'within_plan',
    },
  }
}
