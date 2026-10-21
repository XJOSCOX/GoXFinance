import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { uploadFixture } from './payroll-upload.fixture'
import { payrollDateAdd } from '@goxfinance/shared'
import { statement } from './payroll.fixture'
import { profile, hours } from '../../../../../packages/shared/src/payroll.fixture'
import { testRequest } from '../../testing/workspace'
it.each([false, true])(
  'imports multiple pay frequencies and preserves period/YTD history after restart; encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted)
    const periods = [
      ['monthly', '2026-08-01', '2026-08-31', 10000],
      ['semimonthly', '2026-09-01', '2026-09-15', 20000],
      ['semimonthly', '2026-09-16', '2026-09-30', 30000],
      ['biweekly', '2026-10-05', '2026-10-18', 40000],
      ['monthly', '2026-11-01', '2026-11-30', 60000],
    ] as const
    for (const [frequency, start, end, ytd] of periods) {
      const record = await f.ok('POST', '/income/payroll/upload/save', {
        receipt: await f.receipt(),
        idempotencyKey: randomUUID(),
        sourceId: f.source.id,
        payFrequency: frequency,
        statement: {
          ...statement,
          periodStart: start,
          periodEnd: end,
          payDate: payrollDateAdd(end, 5),
          lines: statement.lines.map((l) => ({
            ...l,
            ytdCents: ytd,
            hoursHundredths: l.code === 'regular' ? 17333 : l.hoursHundredths,
          })),
        },
      })
      expect(record).toMatchObject({
        payFrequency: frequency,
        workweekStart: start,
        workweekEnd: end,
      })
      expect(record.forecasts).toEqual([])
      expect(record.expectedPayDate).toBe(payrollDateAdd(end, 5))
    }
    const before = await f.ok('GET', '/income/payroll')
    expect((await f.ok('GET', '/income')).transactions).toHaveLength(periods.length)
    const next = await f.restart(),
      after = await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    expect(after.json().weeks).toEqual(before.weeks)
  },
)
it('keeps historical weekly periods when the source switches to monthly and rejects overlaps atomically', async () => {
  const f = await uploadFixture(),
    old = await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      statement,
    })
  const changed = await testRequest(
    f.app,
    'PUT' as never,
    f.base + '/income/payroll/profile',
    f.owner.cookie,
    {
      revision: 1,
      reason: 'Synthetic schedule change',
      values: {
        ...profile,
        sourceId: f.source.id,
        payFrequency: 'monthly',
        depositOffsetDays: 5,
        workweekStartDay: 3,
      },
    },
  )
  expect(changed.statusCode).toBe(200)
  const corrected = await f.ok('POST', '/income/payroll/upload/save', {
    receipt: await f.receipt(),
    idempotencyKey: randomUUID(),
    sourceId: f.source.id,
    payFrequency: 'weekly',
    statement,
  })
  expect(corrected.id).toBe(old.id)
  expect(corrected.payFrequency).toBe('weekly')
  expect(corrected.expectedPayDate).toBe(old.expectedPayDate)
  const overlap = await f.send('POST', '/income/payroll/upload/save', {
    receipt: await f.receipt(),
    idempotencyKey: randomUUID(),
    sourceId: f.source.id,
    payFrequency: 'monthly',
    statement: { ...statement, periodStart: '2026-10-01', periodEnd: '2026-10-31' },
  })
  expect(overlap.statusCode).toBe(409)
  expect((await f.ok('GET', '/income/payroll')).weeks).toHaveLength(1)
  expect((await f.ok('GET', '/income')).transactions).toHaveLength(1)
})
it('forecasts a monthly hours report without assuming forty hours per week', async () => {
  const f = await uploadFixture()
  await testRequest(f.app, 'PUT' as never, f.base + '/income/payroll/profile', f.owner.cookie, {
    revision: 1,
    reason: 'Synthetic monthly schedule',
    values: { ...profile, sourceId: f.source.id, payFrequency: 'monthly', depositOffsetDays: 5 },
  })
  const saved = await f.ok('POST', '/income/payroll/weeks', {
    values: {
      ...hours,
      sourceId: f.source.id,
      payFrequency: 'monthly',
      workweekStart: '2026-10-01',
      workweekEnd: '2026-10-31',
      regularHundredths: 17333,
      overtimeHundredths: 0,
      ptoHundredths: 0,
      expectedPayDate: '2026-11-05',
    },
    idempotencyKey: randomUUID(),
    revision: 0,
    reason: 'Synthetic actual monthly hours',
    submit: true,
  })
  expect(saved.forecasts[0].result.grossCents).toBe(433325)
})
