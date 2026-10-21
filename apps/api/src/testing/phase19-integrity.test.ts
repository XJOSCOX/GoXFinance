import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { incomeSourceSchema, incomeTransactionSchema, smartForecastInput } from '@goxfinance/shared'
import { setup } from './financial-workspace'
import { testRequest, testUser } from './workspace'
import { openSqlite } from '../db/encryption/sqlite-engine'

afterEach(() => vi.useRealTimers())

it.each([false, true])(
  'reconciles canonical payroll, actual cash and immutable projections through restart; encrypted=%s',
  async (encrypted) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T17:00:00Z'))
    const f = await setup(encrypted)
    const source = async (name: string, incomeType: 'hourly' | 'salary') =>
      (
        await f.ok('POST', '/income/sources', {
          idempotencyKey: randomUUID(),
          values: incomeSourceSchema.parse({
            responsibleMemberId: f.member,
            name,
            incomeType,
            frequency: 'weekly',
            hourlyRateCents: incomeType === 'hourly' ? 2500 : null,
            expectedGrossCents: 100000,
            expectedNetCents: 80000,
            payday: 5,
            overtimeMultiplier: '1.5',
            notes: null,
            status: 'active',
          }),
        })
      ).source
    const hourly = await source('Synthetic civilian employer', 'hourly'),
      salary = await source('Synthetic military employer', 'salary')
    const paycheck = async (sourceId: string, amount: number) =>
      (
        await f.ok('POST', '/income/transactions', {
          idempotencyKey: randomUUID(),
          values: incomeTransactionSchema.parse({
            sourceId,
            workPeriodStart: '2026-10-12',
            workPeriodEnd: '2026-10-18',
            payDate: '2026-10-23',
            status: 'pending',
            expectedNetCents: amount,
            regularHours: null,
            overtimeHours: null,
            hourlyRateCents: null,
            overtimeMultiplier: '1.5',
            expectedGrossCents: null,
            actualGrossCents: null,
            deductionsCents: null,
            actualNetCents: null,
            depositDate: null,
            reference: null,
            notes: null,
            receiptConfirmed: false,
            tradingPayoutWithdrawn: false,
          }),
        })
      ).transaction
    const hourlyPay = await paycheck(hourly.id, 80000)
    await paycheck(salary.id, 60000)
    const initial = await f.ok('GET', '/forecasts')
    const settings = await testRequest(
      f.app,
      'PUT' as never,
      f.base + '/forecasts/preferences',
      f.owner.cookie,
      {
        idempotencyKey: randomUUID(),
        fingerprint: initial.fingerprint,
        revision: 0,
        reason: 'Synthetic available cash',
        includeRecordedSameDayActivity: false,
        values: {
          bufferCents: 10000,
          opening: {
            amountCents: 90000,
            effectiveAt: '2026-10-19T08:00:00-05:00',
            effectiveDate: '2026-10-19',
            source: 'user_confirmed',
            confidence: 'confirmed',
            confirmed: true,
            accounts: [],
            includedActivityIds: [],
          },
        },
      },
    )
    expect(settings.statusCode, settings.body).toBe(200)
    const smart = await f.ok('GET', '/forecasts/smart?days=30')
    expect(smart.report).toMatchObject({
      incomeCents: 140000,
      endingCents: 230000,
      incomplete: false,
    })
    expect(smart.report.notices.map((n: { severity: string }) => n.severity)).toEqual([
      'informational',
      'caution',
    ])
    const snapshotBody = {
      idempotencyKey: randomUUID(),
      fingerprint: smart.fingerprint,
      values: smart.input,
    }
    const saved = (await f.ok('POST', '/forecasts', snapshotBody)).record
    expect((await f.ok('POST', '/forecasts', snapshotBody)).record.id).toBe(saved.id)
    const historical = (await f.ok('GET', '/forecasts')).scenarios[0]
    const deposit = await f.ok('PATCH', '/income/transactions/' + hourlyPay.id, {
      revision: hourlyPay.revision,
      reason: 'Synthetic early bank deposit',
      values: incomeTransactionSchema.strip().parse({
        ...hourlyPay,
        status: 'confirmed',
        receiptConfirmed: true,
        depositDate: '2026-10-20',
        actualNetCents: 82341,
      }),
    })
    expect(deposit.transaction.status).toBe('confirmed')
    const next = await f.ok('GET', '/forecasts/smart?days=30')
    expect(next.report).toMatchObject({
      incomeCents: 142341,
      endingCents: 232341,
      incomplete: false,
    })
    expect(
      next.report.events.filter((e: { sourceId: string }) => e.sourceId === hourly.id),
    ).toHaveLength(1)
    const income = await f.ok('GET', '/income')
    expect(income.transactions).toHaveLength(2)
    const overview = await f.ok('GET', '/overview')
    // The actual ledger contains only the received civilian deposit, not the salary expectation.
    expect(overview.income).toEqual({ confirmedCents: 82341, netRecordedCashFlowCents: 82341 })
    expect((await f.ok('GET', '/forecasts')).scenarios[0]).toEqual(historical)
    expect(
      (await f.send('POST', '/forecasts', { ...snapshotBody, idempotencyKey: randomUUID() }))
        .statusCode,
    ).toBe(409)
    const viewer = await testUser(f.app, 'SyntheticViewer')
    f.grant(viewer.id, 'viewer')
    const data = await f.ok('GET', '/forecasts', undefined, viewer.cookie)
    expect(
      (
        await f.send(
          'POST',
          '/forecasts',
          {
            idempotencyKey: randomUUID(),
            fingerprint: data.fingerprint,
            values: smartForecastInput(null, '2026-10-20', 30),
          },
          viewer.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const outsider = await testUser(f.app, 'SyntheticOutsider')
    expect((await f.send('GET', '/forecasts/smart', undefined, outsider.cookie)).statusCode).toBe(
      404,
    )
    const app = await f.restart()
    const after = (await testRequest(app, 'GET', f.base + '/forecasts', f.owner.cookie)).json()
    expect(after.scenarios[0]).toEqual(historical)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(
        db
          .prepare('SELECT COUNT(*) AS n FROM income_transactions WHERE status = ?')
          .get('confirmed'),
      ).toEqual({ n: 1 })
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM income_transactions WHERE status = ?').get('pending'),
      ).toEqual({ n: 1 })
    } finally {
      db.close()
    }
  },
)
