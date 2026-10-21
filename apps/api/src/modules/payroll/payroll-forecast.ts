import { randomUUID } from 'node:crypto'
import {
  payrollProfileSchema,
  payrollForecast,
  payrollForecastContext,
  localBillDate,
  type PayrollWeek,
} from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
export function recordPayrollForecast(store: PayrollRepository, home: string, w: PayrollWeek) {
  const raw = store.rawWeek(home, w.id)!,
    p = payrollProfileSchema.parse(JSON.parse(raw.profileSnapshotJson)),
    now = new Date().toISOString(),
    { prior, samples, errors } = payrollForecastContext(store.weeks(home), w, now, w.id),
    result = payrollForecast(p, w, samples, errors),
    version = Math.max(0, ...store.models(home, w.sourceId).map((m) => m.version)) + 1
  store.model({
    id: randomUUID(),
    householdId: home,
    sourceId: w.sourceId,
    version,
    observationsJson: JSON.stringify({
      weekIds: prior.map((v) => v.id),
      observations: prior.map((v) => ({
        weekId: v.id,
        statementId: store.rawWeek(home, v.id)!.statementId,
        reviewedAt: v.reviewedAt,
        statement: v.statement,
      })),
      profile: p,
      errors,
      algorithm:
        result.explanation?.algorithm ??
        (result.deductions.some((d) => d.code === 'historical_total')
          ? 'nearest-gross-total-ratio-v1'
          : 'nearest-gross-components-v1'),
    }),
    createdAt: now,
  })
  store.forecast({
    id: randomUUID(),
    householdId: home,
    sourceId: w.sourceId,
    weekId: w.id,
    modelVersion: version,
    hoursRevision: w.revision,
    resultJson: JSON.stringify(result),
    eligibleForAccuracy:
      !w.statementReceivedAt && w.expectedPayDate !== null && w.expectedPayDate >= localBillDate(),
    createdAt: now,
  })
}
