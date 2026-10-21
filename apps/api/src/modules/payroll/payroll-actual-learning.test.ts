import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { payrollComparison } from '@goxfinance/shared'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { hours } from '../../../../../packages/shared/src/payroll.fixture'
import { testRequest } from '../../testing/workspace'
it.each([false, true])(
  'compares uploaded actuals to the saved forecast and learns only the same employer across restart; encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted)
    await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      statement,
    })
    const report = (start: string, end: string, payDate: string) => ({
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
      idempotencyKey: randomUUID(),
      submit: false,
      revision: 0,
      reason: 'Fictional payroll comparison',
    })
    const draft = await f.ok(
      'POST',
      '/income/payroll/weeks',
      report('2026-11-02', '2026-11-08', '2026-11-13'),
    )
    expect(draft.forecasts[0].result.netCents).toBe(80000)
    const actual = {
      ...statement,
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
      payDate: '2026-11-13',
      deductionsCents: 24000,
      netCents: 76000,
      lines: statement.lines.map((l) => ({
        ...l,
        currentCents: l.side === 'deduction' ? 24000 : l.currentCents,
      })),
    }
    const reviewed = await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      draftWeekId: draft.id,
      statement: actual,
    })
    expect(reviewed.id).toBe(draft.id)
    expect(reviewed.forecasts).toEqual(draft.forecasts)
    expect(payrollComparison(reviewed)).toMatchObject({
      forecastId: draft.forecasts[0].id,
      net: { predicted: 80000, actual: 76000 },
      errorCents: -4000,
    })
    const military = {
      ...statement,
      employer: 'Fictional Military Employer',
      payBasis: 'salary',
      deductionsCents: 90000,
      netCents: 10000,
      lines: statement.lines.map((l) => ({
        ...l,
        currentCents: l.side === 'deduction' ? 90000 : l.currentCents,
        hoursHundredths: null,
        rateCents: null,
        worked: null,
      })),
    }
    await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      newSource: { name: military.employer },
      payFrequency: 'weekly',
      statement: military,
    })
    const next = await f.ok(
      'POST',
      '/income/payroll/weeks',
      report('2026-11-09', '2026-11-15', '2026-11-20'),
    )
    expect(next.forecasts[0].result).toMatchObject({
      netCents: 78000,
      explanation: { sampleCount: 2 },
    })
    const ledger = await f.ok('GET', '/income')
    expect(
      ledger.transactions.find((t: { id: string }) => t.id === reviewed.incomeTransactionId).status,
    ).toBe('pending')
    const app = await f.restart(),
      saved = (await testRequest(app, 'GET', f.base + '/income/payroll', f.owner.cookie))
        .json()
        .weeks.find((w: { id: string }) => w.id === draft.id)
    expect(saved.forecasts).toEqual(draft.forecasts)
    expect(payrollComparison(saved)?.errorCents).toBe(-4000)
  },
)
