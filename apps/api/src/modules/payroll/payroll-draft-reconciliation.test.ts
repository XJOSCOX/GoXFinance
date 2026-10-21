import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { payrollComparison } from '@goxfinance/shared'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { hours } from '../../../../../packages/shared/src/payroll.fixture'
import { testRequest } from '../../testing/workspace'
async function draft(encrypted = false) {
  const f = await uploadFixture(encrypted),
    values = {
      ...hours,
      sourceId: f.source.id,
      payFrequency: 'weekly',
      customWorkPeriod: true,
      workweekStart: '2026-11-11',
      workweekEnd: '2026-11-15',
      expectedPayDate: '2026-11-20',
      regularHundredths: 3857,
      regularMinutes: 2314,
      overtimeHundredths: 0,
      ptoHundredths: 0,
    },
    saved = await f.ok('POST', '/income/payroll/weeks', {
      values,
      revision: 0,
      reason: 'Fictional estimate',
      submit: false,
      idempotencyKey: randomUUID(),
    })
  return { ...f, draft: saved, values }
}
it.each([false, true])(
  'reconciles a custom draft into one real statement without deleting forecast history; encrypted=%s',
  async (encrypted) => {
    const f = await draft(encrypted),
      body = {
        receipt: await f.receipt(),
        idempotencyKey: randomUUID(),
        sourceId: f.source.id,
        draftWeekId: f.draft.id,
        statement: {
          ...statement,
          periodStart: '2026-11-09',
          periodEnd: '2026-11-15',
          payDate: '2026-11-20',
        },
      }
    const saved = await f.ok('POST', '/income/payroll/upload/save', body)
    expect(saved).toMatchObject({
      id: f.draft.id,
      stage: 'paystub_reviewed',
      workweekStart: '2026-11-09',
      workweekEnd: '2026-11-15',
      regularHundredths: 4000,
      forecastPeriodReconciled: true,
    })
    expect(saved.forecasts).toEqual(f.draft.forecasts)
    expect(payrollComparison(saved)).toBeNull()
    expect(saved.statement).toMatchObject({
      grossCents: 100000,
      deductionsCents: 20000,
      netCents: 80000,
    })
    expect((await f.ok('GET', '/income')).transactions).toEqual([
      expect.objectContaining({
        status: 'pending',
        actualGrossCents: 100000,
        actualNetCents: 80000,
        regularHours: '40.00',
        overtimeHours: null,
        depositDate: null,
      }),
    ])
    expect((await f.ok('POST', '/income/payroll/upload/save', body)).id).toBe(saved.id)
    expect((await f.ok('GET', '/income/payroll')).weeks).toHaveLength(1)
    const next = await f.restart(),
      response = await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    expect(response.json().weeks[0]).toEqual(saved)
  },
)
it('rejects stale preview, unknown targets and conflicting periods, and rolls failed reviews back atomically', async () => {
  const f = await draft(),
    base = {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      draftWeekId: f.draft.id,
      statement: {
        ...statement,
        periodStart: '2026-11-09',
        periodEnd: '2026-11-15',
        payDate: '2026-11-20',
      },
    }
  expect(
    (await f.send('POST', '/income/payroll/upload/save', { ...base, draftWeekId: randomUUID() }))
      .statusCode,
  ).toBe(404)
  expect(
    (
      await f.send('POST', '/income/payroll/upload/save', {
        ...base,
        statement: { ...base.statement, netCents: 1 },
      })
    ).statusCode,
  ).toBe(400)
  expect((await f.ok('GET', '/income/payroll')).weeks[0]).toEqual(f.draft)
  expect((await f.ok('GET', '/income')).transactions).toEqual([])
  await f.ok('POST', '/income/payroll/weeks', {
    values: {
      ...f.values,
      workweekStart: '2026-11-16',
      workweekEnd: '2026-11-22',
      expectedPayDate: '2026-11-27',
    },
    revision: 0,
    reason: 'Another fictional estimate',
    submit: false,
    idempotencyKey: randomUUID(),
  })
  expect(
    (
      await f.send('POST', '/income/payroll/upload/save', {
        ...base,
        receipt: await f.receipt(),
        statement: { ...base.statement, periodStart: '2026-11-16', periodEnd: '2026-11-22' },
      })
    ).statusCode,
  ).toBe(409)
  await f.ok('PATCH', '/income/payroll/weeks/' + f.draft.id, {
    values: { ...f.values, regularHundredths: 3900, regularMinutes: 2340 },
    revision: f.draft.revision,
    reason: 'Revise fictional hours',
    submit: false,
    idempotencyKey: randomUUID(),
  })
  expect((await f.send('POST', '/income/payroll/upload/save', base)).statusCode).toBe(409)
  expect((await f.ok('GET', '/income')).transactions).toEqual([])
})
