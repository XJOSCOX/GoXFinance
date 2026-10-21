import type { ForecastWarnings } from './forecast-warnings'
import { paycheckAssumptionOverlap } from './forecast-paycheck-overlap'
import type { ForecastEvent, ForecastInput, ForecastSources } from './forecasts'
import { forecastInflows } from './forecast-inflows'
export function smartForecastInflows(
  s: ForecastSources,
  v: ForecastInput,
  today: string,
  add: (e: ForecastEvent) => void,
  warnings: ForecastWarnings,
) {
  const handled = new Set<string>(),
    represented: ForecastEvent[] = [],
    representedDates = new Map<string, Set<string>>(),
    sources = new Map(s.income.sources.map((src) => [src.id, src]))
  const rememberDates = (sourceId: string, dates: (string | null | undefined)[]) => {
    const known = representedDates.get(sourceId) ?? new Set<string>()
    for (const date of dates) if (date) known.add(date)
    representedDates.set(sourceId, known)
  }
  const emit = (e: ForecastEvent) => {
    represented.push(e)
    add(e)
  }
  const name = (id: string) => sources.get(id)?.name ?? 'Paycheck'
  for (const w of s.payroll ?? []) {
    if (w.estimateCancelled) continue
    const related = s.income.transactions.filter(
      (t) =>
        t.id === w.incomeTransactionId ||
        (t.sourceId === w.sourceId &&
          t.workPeriodStart === w.workweekStart &&
          t.workPeriodEnd === w.workweekEnd),
    )
    const t =
      related.find((t) => t.status === 'confirmed' && t.depositDate && t.depositDate <= today) ??
      related.find((t) => t.id === w.incomeTransactionId && t.status !== 'cancelled') ??
      related.find((t) => t.status === 'pending') ??
      related[0]
    related.forEach((t) => handled.add(t.id))
    if (t?.status === 'cancelled') continue
    rememberDates(w.sourceId, [
      w.expectedPayDate,
      w.statement?.payDate,
      ...related.flatMap((t) => [t.payDate, t.depositDate]),
    ])
    const source = sources.get(w.sourceId)
    if (!t && !w.reviewedAt && (source?.isArchived || source?.status !== 'active')) continue
    if (related.filter((t) => t.status === 'confirmed').length > 1)
      warnings.push(
        `Multiple confirmed income records for a payroll period: ${name(w.sourceId)}. Review its links before relying on cash totals.`,
      )
    const confirmed = t?.status === 'confirmed' && t.depositDate && t.depositDate <= today
    const reviewed = !!w.reviewedAt && !!w.statement
    const f = [...w.forecasts].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.modelVersion - a.modelVersion,
    )[0]
    const date = confirmed
      ? t.depositDate!
      : ((t?.status === 'confirmed' ? (t.depositDate ?? t.payDate) : t?.payDate) ??
        w.expectedPayDate ??
        w.statement?.payDate ??
        null)
    if (!date) {
      warnings.push(`Missing expected paycheck date: ${name(w.sourceId)}`)
    }
    if (!confirmed && !reviewed && !t && !f) continue
    emit({
      id: confirmed ? 'income:' + t.id : 'payroll:' + w.id,
      date: date ?? v.startDate,
      originalDate: w.statement?.payDate ?? w.expectedPayDate ?? t?.payDate ?? date,
      name: name(w.sourceId),
      amountCents: confirmed
        ? t.actualNetCents
        : reviewed
          ? w.statement!.netCents
          : t
            ? (t.actualNetCents ?? t.expectedNetCents)
            : (f?.result.netCents ?? null),
      direction: 'in',
      kind: confirmed ? 'confirmed_income' : 'expected_income',
      estimated: !confirmed,
      classification: confirmed
        ? 'confirmed_cash'
        : reviewed || t?.status === 'pending'
          ? 'documented_payroll'
          : 'payroll_forecast',
      grossCents: confirmed
        ? t.actualGrossCents
        : reviewed
          ? w.statement!.grossCents
          : (f?.result.grossCents ?? t?.expectedGrossCents ?? null),
      reference: confirmed ? { type: 'income', id: t.id } : { type: 'payroll', id: w.id },
      sourceId: w.sourceId,
      workPeriod: { start: w.workweekStart, end: w.workweekEnd },
      modelVersion: f?.modelVersion,
      sampleCount: f?.result.explanation?.sampleCount,
      confidence: confirmed ? 'confirmed' : reviewed ? 'high' : (f?.result.confidence ?? 'unknown'),
      basis: confirmed
        ? 'Confirmed Income deposit replaces all estimates for this payroll period.'
        : reviewed
          ? 'Reviewed paystub net awaiting receipt replaces the saved forecast; no deposit is assumed.'
          : t
            ? 'Linked Income transaction replaces the payroll forecast.'
            : 'Saved forecast from explicitly reported payroll hours; future unreported hours are not assumed.',
    })
    // Distinct confirmed ledger deposits must not disappear merely because their
    // periods overlap. Retain them and block authoritative projections for review.
    for (const other of related.filter(
      (r) => r.id !== t?.id && r.status === 'confirmed' && r.depositDate && r.depositDate <= today,
    ))
      emit({
        id: 'income:' + other.id,
        date: other.depositDate!,
        originalDate: other.payDate,
        name: name(other.sourceId),
        amountCents: other.actualNetCents,
        direction: 'in',
        kind: 'confirmed_income',
        estimated: false,
        classification: 'confirmed_cash',
        sourceId: other.sourceId,
        reference: { type: 'income', id: other.id },
        workPeriod: { start: w.workweekStart, end: w.workweekEnd },
        basis:
          'Distinct confirmed Income record with overlapping payroll identity; review the ambiguity in the ledger.',
      })
  }
  const priority = (t: ForecastSources['income']['transactions'][number]) =>
    t.status === 'confirmed' && t.depositDate && t.depositDate <= today
      ? 0
      : t.status === 'pending'
        ? 1
        : 2
  for (const t of [...s.income.transactions].sort((a, b) => priority(a) - priority(b))) {
    if (handled.has(t.id) || t.status === 'cancelled') continue
    const confirmed = t.status === 'confirmed' && t.depositDate && t.depositDate <= today
    const date = confirmed
      ? t.depositDate!
      : t.status === 'confirmed'
        ? (t.depositDate ?? t.payDate)
        : t.payDate
    // Canonical work-period identity also covers legacy linked records without a payroll UUID.
    const overlapping =
      t.workPeriodStart &&
      t.workPeriodEnd &&
      represented.some(
        (e) =>
          e.sourceId === t.sourceId &&
          e.workPeriod?.start === t.workPeriodStart &&
          e.workPeriod?.end === t.workPeriodEnd,
      )
    if (overlapping) {
      if (!confirmed) continue
      warnings.push(
        `Multiple confirmed income records for a payroll period: ${name(t.sourceId)}. Review its links before relying on cash totals.`,
      )
    }
    rememberDates(t.sourceId, [t.payDate, t.depositDate])
    emit({
      id: 'income:' + t.id,
      date,
      originalDate: t.payDate,
      name: name(t.sourceId),
      amountCents: confirmed ? t.actualNetCents : (t.actualNetCents ?? t.expectedNetCents),
      direction: 'in',
      kind: confirmed ? 'confirmed_income' : 'expected_income',
      estimated: !confirmed,
      classification: confirmed
        ? 'confirmed_cash'
        : t.status === 'pending'
          ? 'documented_payroll'
          : 'assumed_income',
      reference: { type: 'income', id: t.id },
      sourceId: t.sourceId,
      grossCents: t.actualGrossCents ?? t.expectedGrossCents,
      confidence: confirmed ? 'confirmed' : 'estimated',
      ...(t.workPeriodStart && t.workPeriodEnd
        ? { workPeriod: { start: t.workPeriodStart, end: t.workPeriodEnd } }
        : {}),
      basis: confirmed
        ? 'Actual confirmed deposit; counts once through the Income ledger.'
        : 'Recorded Income expectation, not received cash.',
    })
  }
  // Source-level patterns are opt-in scenario assumptions, never inferred from unknown hours.
  const assumed = s.income.sources.filter((src) => v.income.some((a) => a.sourceId === src.id))
  forecastInflows(
    { ...s, income: { ...s.income, sources: assumed, transactions: [] } },
    v,
    today,
    (e) => {
      if (e.kind === 'confirmed_income') return
      const source = assumed.find((src) => e.id.startsWith('forecast-income:' + src.id + ':'))!
      const dates = representedDates.get(source.id)
      const overlap = paycheckAssumptionOverlap(source.frequency, dates ?? [], e.date)
      if (overlap === 'exact') return
      if (overlap === 'ambiguous') {
        warnings.push(
          `Ambiguous recurring paycheck assumption for ${source.name} (${e.date}): a nearby recorded paycheck has a different date. The overlapping assumption is excluded until its work period is confirmed.`,
        )
        return
      }
      emit({
        ...e,
        sourceId: source.id,
        classification: 'assumed_income',
        confidence: 'estimated',
        reference: { type: 'income', id: source.id },
        sampleCount: 0,
        basis:
          'Explicit source-level net-pay assumption. No unreported hours are treated as worked.',
      })
    },
    warnings,
  )
  for (const src of s.income.sources.filter(
    (src) => src.status === 'active' && !src.isArchived && src.incomeType !== 'trading_payout',
  ))
    if (
      !v.income.some((a) => a.sourceId === src.id) &&
      !represented.some(
        (e) => e.sourceId === src.id && e.date >= v.startDate && e.date <= v.endDate,
      )
    )
      warnings.push(
        `No upcoming reported paycheck or approved date/net assumption: ${src.name}. Future hours and take-home are unknown.`,
      )
}
