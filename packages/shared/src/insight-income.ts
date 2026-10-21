import { payrollComparison } from './payroll-calculations'
import { sumCents } from './outflows'
import { dayOffset, median, roundedRatio } from './insight-statistics'
import type { InsightSources, InsightSink, InsightRef } from './insights'

export function incomeInsights(s: InsightSources, today: string, emit: InsightSink) {
  for (const source of s.income.sources) {
    const actual = s.income.transactions
      .filter(
        (t) =>
          t.sourceId === source.id &&
          t.status === 'confirmed' &&
          t.depositDate &&
          t.depositDate <= today &&
          t.actualNetCents !== null,
      )
      .sort((a, b) => a.depositDate!.localeCompare(b.depositDate!) || a.id.localeCompare(b.id))
    const recent = actual.filter((t) => t.depositDate! >= dayOffset(today, -180)).slice(-8)
    const values = recent.map((t) => t.actualNetCents!),
      middle = median(values),
      refs: InsightRef[] = recent.map((t) => ({ type: 'income', id: t.id, date: t.depositDate! }))
    const base = {
      area: 'income' as const,
      confidence: 'medium' as const,
      priority: 'informational' as const,
      from: recent[0]?.depositDate ?? today,
      through: recent.at(-1)?.depositDate ?? today,
      impactCents: null,
      changeBps: null,
      action: 'Review this employer’s received paychecks and work periods.',
      tradeoffs: ['Do not base essential payments on unconfirmed overtime or forecast take-home.'],
      limitations: [
        'Recorded deposits only; missing pay periods are not zero income.',
        'Withholding is not final annual tax liability.',
      ],
      module: 'income',
    }
    const comparable =
      recent.length >= 4 &&
      new Set(recent.map((t) => t.workPeriodStart + ':' + t.workPeriodEnd)).size ===
        recent.length &&
      recent.every(
        (t) =>
          t.frequencySnapshot === recent[0].frequencySnapshot &&
          t.frequencySnapshot !== 'irregular' &&
          t.workPeriodStart &&
          t.workPeriodEnd &&
          Date.parse(t.workPeriodEnd) - Date.parse(t.workPeriodStart) ===
            Date.parse(recent[0].workPeriodEnd!) - Date.parse(recent[0].workPeriodStart!),
      )
    if (comparable && middle !== null && middle > 0) {
      const deviation = roundedRatio(
        sumCents(values.map((v) => Math.abs(v - middle))),
        values.length,
      )!
      const variability = roundedRatio(deviation, middle, 10000)
      emit({
        ...base,
        id: `income-variation:${source.id}`,
        type: 'income_variability',
        title: `${source.name}: take-home variability`,
        explanation:
          'Comparable actual pay periods from this employer only. The median and mean absolute deviation describe the recorded sample, not guaranteed future pay.',
        sampleCount: recent.length,
        refs,
        method: 'Median take-home; mean absolute deviation / median, rounded to basis points',
        currentCents: middle,
        comparisonCents: deviation,
        changeBps: variability,
      })
      const half = Math.floor(recent.length / 2),
        before = roundedRatio(sumCents(values.slice(0, half)), half)!,
        after = roundedRatio(sumCents(values.slice(-half)), half)!
      emit({
        ...base,
        id: `income-trend:${source.id}`,
        type: 'income_trend',
        title: `${source.name}: comparable take-home trend`,
        explanation:
          'Mean actual net pay in the recent half of the sample compared with its earlier half. Different employers and pay frequencies are never pooled.',
        sampleCount: half * 2,
        refs,
        method: 'Equal-size recent and earlier groups of comparable confirmed work periods',
        currentCents: after,
        comparisonCents: before,
        changeBps: roundedRatio(after - before, before, 10000),
      })
    }
    const weeks = (s.payroll ?? [])
      .filter(
        (w) =>
          w.sourceId === source.id &&
          w.reviewedAt &&
          w.statement &&
          w.incomeTransactionId &&
          actual.some((t) => t.id === w.incomeTransactionId),
      )
      .sort((a, b) => (a.statement!.payDate ?? '').localeCompare(b.statement!.payDate ?? ''))
    const latest = weeks.at(-1)
    if (latest?.statement) {
      const statement = latest.statement,
        ref: InsightRef = {
          type: 'payroll',
          id: latest.id,
          date: statement.payDate ?? latest.workweekEnd,
        }
      const lines = statement.lines.filter((l) => l.side === 'deduction'),
        sign = statement.deductionSign === 'negative' ? -1 : 1
      const deductions = (codes: string[]) => {
        const selected = lines.filter((l) => codes.includes(l.code))
        return selected.length && selected.every((l) => l.currentCents !== null)
          ? sumCents(selected.map((l) => sign * l.currentCents!))
          : null
      }
      const summary = [
        ['Federal withholding', deductions(['federal'])],
        ['Social Security', deductions(['social_security'])],
        ['Medicare', deductions(['medicare'])],
        ['Retirement deductions', deductions(['roth', 'traditional'])],
      ] as const
      for (const [label, value] of summary)
        if (value !== null)
          emit({
            ...base,
            id: `payroll-component:${source.id}:${label}`,
            type: 'payroll_component',
            title: `${source.name}: ${label}`,
            explanation:
              'Current-period amount from the latest reviewed, received paycheck. Separate from YTD and final tax liability.',
            from: latest.workweekStart,
            through: latest.workweekEnd,
            sampleCount: 1,
            refs: [ref],
            method: 'Reviewed current-period deduction lines; printed deduction sign normalized',
            currentCents: value,
            comparisonCents: null,
          })
      const netRate =
        statement.netCents !== null && statement.grossCents !== null
          ? roundedRatio(statement.netCents, statement.grossCents, 10000)
          : null
      emit({
        ...base,
        id: `payroll-rate:${source.id}`,
        type: 'take_home_rate',
        title: `${source.name}: effective take-home rate`,
        explanation:
          'Actual net / gross on the latest reviewed received paycheck; includes the effects of payroll deductions, not an annual tax rate.',
        from: latest.workweekStart,
        through: latest.workweekEnd,
        sampleCount: 1,
        refs: [ref],
        method: 'Actual statement net / gross, rounded to basis points',
        currentCents: statement.netCents,
        comparisonCents: statement.grossCents,
        changeBps: netRate,
      })
      const worked =
        statement.reportedWorkedHundredths ??
        (statement.lines.some((l) => l.side === 'earnings' && l.worked === true) &&
        statement.lines
          .filter((l) => l.side === 'earnings' && l.worked === true)
          .every((l) => l.hoursHundredths !== null)
          ? sumCents(
              statement.lines
                .filter((l) => l.side === 'earnings' && l.worked === true)
                .map((l) => l.hoursHundredths!),
            )
          : null)
      emit({
        ...base,
        id: `payroll-hours:${source.id}`,
        type: 'payroll_hours',
        title: `${source.name}: paid work context`,
        explanation: `Latest reviewed statement: ${worked === null ? 'worked hours unknown' : `${worked / 100} worked hours`}. PTO and holiday lines remain separate; gross and take-home are shown together for comparison.`,
        from: latest.workweekStart,
        through: latest.workweekEnd,
        sampleCount: 1,
        refs: [ref],
        method: 'Reviewed earnings lines and printed worked-hours total; PTO is not assumed worked',
        currentCents: statement.grossCents,
        comparisonCents: statement.netCents,
      })
    }
    // Compare employer-specific statements only when four distinct equivalent work periods exist.
    const sample = weeks.slice(-4)
    if (
      sample.length === 4 &&
      new Set(sample.map((w) => w.workweekStart + ':' + w.workweekEnd)).size === 4 &&
      sample.every(
        (w) =>
          w.payFrequency === sample[0].payFrequency &&
          Date.parse(w.workweekEnd) - Date.parse(w.workweekStart) ===
            Date.parse(sample[0].workweekEnd) - Date.parse(sample[0].workweekStart),
      )
    ) {
      for (const code of [
        'regular',
        'overtime',
        'pto',
        'federal',
        'social_security',
        'medicare',
        'roth',
        'traditional',
        'other_deduction',
      ]) {
        const amounts = sample.map((w) => {
          const lines = w.statement!.lines.filter((l) => l.code === code)
          return lines.length && lines.every((l) => l.currentCents !== null)
            ? sumCents(
                lines.map(
                  (l) =>
                    l.currentCents! *
                    (l.side === 'deduction' && w.statement!.deductionSign === 'negative' ? -1 : 1),
                ),
              )
            : null
        })
        if (amounts.some((a) => a === null)) continue
        const before = roundedRatio(sumCents(amounts.slice(0, 2) as number[]), 2)!,
          after = roundedRatio(sumCents(amounts.slice(2) as number[]), 2)!
        if (before === after) continue
        emit({
          ...base,
          id: `payroll-trend:${source.id}:${code}`,
          type: 'payroll_line_trend',
          title: `${source.name}: ${code.replaceAll('_', ' ')} trend`,
          explanation:
            'Mean current-period amounts in the latest two reviewed received paychecks compared with the preceding two equivalent work periods. PTO remains separate from worked earnings; withholding is not annual tax liability.',
          from: sample[0].workweekStart,
          through: sample[3].workweekEnd,
          sampleCount: 4,
          currentCents: after,
          comparisonCents: before,
          changeBps: roundedRatio(after - before, before, 10000),
          refs: sample.map((w) => ({
            type: 'payroll',
            id: w.id,
            date: w.statement!.payDate ?? w.workweekEnd,
          })),
          method:
            'Two versus two employer-specific, same-duration/pay-frequency current-period line totals; no YTD summation',
        })
      }
    }
    const comparisons = weeks.flatMap((w) => {
      const t = actual.find((t) => t.id === w.incomeTransactionId)!
      // Conservative no-look-ahead rule: prediction must predate both document
      // receipt and the calendar day of the actual deposit, including backdates.
      const eligible = w.forecasts.filter(
        (f) =>
          f.createdAt.slice(0, 10) < t.depositDate! &&
          !!t.confirmedAt &&
          f.createdAt < t.confirmedAt,
      )
      const c = payrollComparison({ ...w, forecasts: eligible })
      return c?.errorCents !== null && c?.errorCents !== undefined
        ? [{ week: w, error: c.errorCents }]
        : []
    })
    if (comparisons.length >= 3)
      emit({
        ...base,
        id: `payroll-accuracy:${source.id}`,
        type: 'forecast_accuracy',
        title: `${source.name}: saved prediction accuracy`,
        explanation:
          'Only forecasts saved before both the paystub and deposit day qualify. These are forward predictions, not historical backtests.',
        sampleCount: comparisons.length,
        refs: comparisons.map(({ week }) => ({
          type: 'payroll',
          id: week.id,
          date: week.statement!.payDate ?? week.workweekEnd,
        })),
        method:
          'Mean absolute actual-net minus last eligible saved predicted-net error, rounded to cents',
        currentCents: roundedRatio(
          sumCents(comparisons.map((c) => Math.abs(c.error))),
          comparisons.length,
        ),
        comparisonCents: null,
      })
    if (recent.length >= 3) {
      const delays = recent.map((t) =>
        Math.round((Date.parse(t.depositDate!) - Date.parse(t.payDate)) / 86400000),
      )
      if (delays.some((d) => d !== 0))
        emit({
          ...base,
          id: `payday-timing:${source.id}`,
          type: 'payday_timing',
          title: `${source.name}: recorded deposit timing`,
          explanation: `Recorded deposits range from ${Math.min(...delays)} to ${Math.max(...delays)} days relative to the stated payday. This does not promise an early or late future deposit.`,
          sampleCount: recent.length,
          refs,
          method: 'Deposit calendar date minus stated payday; actual receipts only',
          currentCents: null,
          comparisonCents: null,
        })
    }
  }
}
