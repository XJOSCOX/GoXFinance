import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { hours } from '../../../../../packages/shared/src/payroll.fixture'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { testRequest } from '../../testing/workspace'
it.each([false, true])(
  'keeps hourly learning isolated after military salary is imported with the same pay frequency; encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted)
    const hourly = await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      statement,
    })
    const forecastBody = (start: string, end: string, payDate: string) => ({
      revision: 0,
      reason: 'Fictional source isolation test',
      submit: false,
      idempotencyKey: randomUUID(),
      values: {
        ...hours,
        sourceId: f.source.id,
        workweekStart: start,
        workweekEnd: end,
        expectedPayDate: payDate,
        regularHundredths: 4000,
        overtimeHundredths: 0,
        ptoHundredths: 0,
        estimateDeductionsFromHistory: true,
      },
    })
    const before = await f.ok(
      'POST',
      '/income/payroll/weeks',
      forecastBody('2026-11-02', '2026-11-08', '2026-11-13'),
    )
    expect(before.forecasts[0].result).toMatchObject({
      grossCents: 100000,
      netCents: 80000,
      deductions: [expect.objectContaining({ amountCents: 20000, sampleCount: 1 })],
    })
    const militaryStatement = {
      ...statement,
      employer: 'Fictional Military Payroll',
      payBasis: 'salary',
      deductionsCents: 90000,
      netCents: 10000,
      lines: statement.lines.map((l) => ({
        ...l,
        currentCents: l.side === 'deduction' ? 90000 : l.currentCents,
        rateCents: null,
        hoursHundredths: null,
        worked: null,
      })),
    }
    const military = await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      newSource: { name: militaryStatement.employer },
      statement: militaryStatement,
      payFrequency: 'weekly',
    })
    expect(military.sourceId).not.toBe(f.source.id)
    const after = await f.ok(
      'POST',
      '/income/payroll/weeks',
      forecastBody('2026-11-09', '2026-11-15', '2026-11-20'),
    )
    expect(after.forecasts[0].result).toEqual({
      ...before.forecasts[0].result,
      explanation: { ...before.forecasts[0].result.explanation, asOf: expect.any(String) },
    })
    const payroll = await f.ok('GET', '/income/payroll')
    expect(
      payroll.profiles.find((p: { sourceId: string }) => p.sourceId === f.source.id)
        .regularRateCents,
    ).toBe(2500)
    expect(payroll.weeks.find((w: { id: string }) => w.id === before.id).forecasts).toEqual(
      before.forecasts,
    )
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity, { readonly: true })
    try {
      const models = db
        .prepare(
          'SELECT observations_json FROM payroll_models WHERE household_id = ? AND source_id = ?',
        )
        .all(f.home, f.source.id) as { observations_json: string }[]
      expect(models.length).toBe(2)
      for (const model of models) {
        const observations = JSON.parse(model.observations_json)
        expect(observations.weekIds).toEqual([hourly.id])
        expect(observations.weekIds).not.toContain(military.id)
      }
    } finally {
      db.close()
    }
    const newerHourly = await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      statement: {
        ...statement,
        periodStart: '2026-10-12',
        periodEnd: '2026-10-18',
        payDate: '2026-10-23',
        deductionsCents: 25000,
        netCents: 75000,
        lines: statement.lines.map((l) => ({
          ...l,
          currentCents: l.side === 'deduction' ? 25000 : l.currentCents,
        })),
      },
    })
    expect(newerHourly.sourceId).toBe(f.source.id)
    const updated = await f.ok(
      'POST',
      '/income/payroll/weeks',
      forecastBody('2026-11-16', '2026-11-22', '2026-11-27'),
    )
    expect(updated.forecasts[0].result).toMatchObject({
      grossCents: 100000,
      netCents: 77500,
      deductions: [expect.objectContaining({ amountCents: 22500, sampleCount: 2 })],
    })
    const next = await f.restart()
    const restarted = (
      await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    ).json()
    expect(restarted.weeks.find((w: { id: string }) => w.id === after.id).forecasts).toEqual(
      after.forecasts,
    )
    expect(restarted.weeks.find((w: { id: string }) => w.id === updated.id).forecasts).toEqual(
      updated.forecasts,
    )
  },
)
