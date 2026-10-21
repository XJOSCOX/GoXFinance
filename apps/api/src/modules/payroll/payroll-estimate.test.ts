import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { hours } from '../../../../../packages/shared/src/payroll.fixture'
import { testRequest, testUser } from '../../testing/workspace'
it.each([false, true])(
  'saves custom-period estimates without income, replays once and persists after restart; encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted)
    await f.ok('POST', '/income/payroll/upload/save', {
      receipt: await f.receipt(),
      idempotencyKey: randomUUID(),
      sourceId: f.source.id,
      statement,
    })
    const before = (await f.ok('GET', '/income')).transactions
    const body = {
      revision: 0,
      reason: 'Fictional forecast',
      submit: false,
      idempotencyKey: randomUUID(),
      values: {
        ...hours,
        sourceId: f.source.id,
        payFrequency: 'weekly',
        customWorkPeriod: true,
        estimateDeductionsFromHistory: true,
        workweekStart: '2026-11-11',
        workweekEnd: '2026-11-15',
        expectedPayDate: '2026-11-20',
        regularHundredths: 3250,
        regularMinutes: 1950,
        overtimeHundredths: 200,
        ptoHundredths: 0,
      },
    }
    const saved = await f.ok('POST', '/income/payroll/weeks', body)
    expect(saved).toMatchObject({
      stage: 'hours_draft',
      customWorkPeriod: true,
      incomeTransactionId: null,
    })
    expect(saved.forecasts[0].result).toMatchObject({
      grossCents: 88750,
      netCents: 71000,
      confidence: 'low',
    })
    expect(saved.forecasts[0].result.deductions).toEqual([
      expect.objectContaining({ code: 'historical_total', amountCents: 17750, sampleCount: 1 }),
    ])
    expect((await f.ok('POST', '/income/payroll/weeks', body)).id).toBe(saved.id)
    expect((await f.ok('GET', '/income')).transactions).toEqual(before)
    expect(
      (await f.send('POST', '/income/payroll/weeks', { ...body, idempotencyKey: randomUUID() }))
        .statusCode,
    ).toBe(409)
    expect(
      (
        await f.send('POST', '/income/payroll/weeks', {
          ...body,
          idempotencyKey: randomUUID(),
          values: { ...body.values, workweekEnd: '2026-11-19' },
        })
      ).statusCode,
    ).toBe(400)
    const outsider = await testUser(f.app, 'ForecastOutsider')
    expect((await f.send('POST', '/income/payroll/weeks', body, outsider.cookie)).statusCode).toBe(
      404,
    )
    const admin = await testUser(f.app, 'ForecastAdmin')
    f.grant(admin.id, 'admin')
    expect((await f.send('POST', '/income/payroll/weeks', body, admin.cookie)).statusCode).toBe(403)
    const viewer = await testUser(f.app, 'ForecastViewer')
    f.grant(viewer.id, 'viewer')
    expect((await f.send('POST', '/income/payroll/weeks', body, viewer.cookie)).statusCode).toBe(
      403,
    )
    const next = await f.restart(),
      response = await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    expect(response.json().weeks.find((w: { id: string }) => w.id === saved.id)).toEqual(saved)
  },
)
