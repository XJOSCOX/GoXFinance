import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { setup } from '../../testing/financial-workspace'
import { testRequest } from '../../testing/workspace'
import { incomeSourceSchema, type PayrollStatement } from '@goxfinance/shared'
import { profile, hours } from '../../../../../packages/shared/src/payroll.fixture'
// Synthetic fixture only; no user statement or financial data is included.
export const statement: PayrollStatement = {
  employer: 'Fictional Payroll',
  assignment: null,
  periodStart: hours.workweekStart,
  periodEnd: hours.workweekEnd,
  payDate: '2026-10-16',
  grossCents: 100000,
  deductionsCents: 20000,
  netCents: 80000,
  acknowledgement: null,
  lines: [
    {
      label: 'Regular',
      side: 'earnings',
      code: 'regular',
      treatment: 'not_applicable',
      currentCents: 100000,
      ytdCents: 900000,
      rateCents: 2500,
      hoursHundredths: 4000,
      worked: true,
      confidence: 'manual',
    },
    {
      label: 'Federal',
      side: 'deduction',
      code: 'federal',
      treatment: 'posttax',
      currentCents: 20000,
      ytdCents: 180000,
      rateCents: null,
      hoursHundredths: null,
      worked: null,
      confidence: 'manual',
    },
  ],
}
export async function fixture(encrypted = false) {
  const f = await setup(encrypted),
    source = (
      await f.ok('POST', '/income/sources', {
        idempotencyKey: randomUUID(),
        values: incomeSourceSchema.parse({
          responsibleMemberId: f.member,
          name: 'Fictional weekly payroll',
          incomeType: 'hourly',
          frequency: 'weekly',
          hourlyRateCents: 2500,
          expectedGrossCents: null,
          expectedNetCents: null,
          payday: 4,
          overtimeMultiplier: '1.5',
          status: 'active',
          notes: null,
        }),
      })
    ).source
  const saved = await testRequest(
    f.app,
    'PUT' as never,
    f.base + '/income/payroll/profile',
    f.owner.cookie,
    { revision: 0, reason: 'Fictional setup', values: { ...profile, sourceId: source.id } },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const w = await f.ok('POST', '/income/payroll/weeks', {
    values: { ...hours, sourceId: source.id },
    idempotencyKey: randomUUID(),
    revision: 0,
    reason: 'Fictional reported hours',
    submit: true,
  })
  return { ...f, source, w }
}
