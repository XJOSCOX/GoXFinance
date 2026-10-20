import { randomBytes, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  forecast,
  netWorth,
  settlementProgress,
  simulatePayoff,
  localBillDate,
  type FinancialReport,
  type ForecastInput,
  type ReportFilters,
  type PlanningData,
  type AssetData,
  type ForecastData,
} from '@goxfinance/shared'
import { setup } from './financial-workspace'
import { testRequest, testUser } from './workspace'
import { create } from '../modules/trading/trading.fixture'
import { openSqlite } from '../db/encryption/sqlite-engine'
import { verifySnapshot } from '../db/sqlite-backups'

afterEach(() => vi.useRealTimers())

const filter: ReportFilters = {
  kind: 'all',
  from: '2026-10-01',
  to: '2026-10-31',
  memberId: null,
  categoryId: null,
  debtId: null,
  accountId: null,
  groupId: null,
}
const rows = (report: FinancialReport, name: string) =>
  report.tables.find((t) => t.name === name)!.rows
const forecastInput = (endDate: string): ForecastInput => ({
  name: 'Fictional final QA ' + endDate,
  startDate: '2026-11-01',
  endDate,
  startingCents: 20000,
  confidence: 'confirmed',
  mode: 'expected',
  income: [],
  variableSpendingCents: 0,
  extraDebtCents: 0,
  includeSettlements: false,
  includeUncertainPayouts: false,
  oneTime: [],
})

it.each([false, true])(
  'validates all nine new-module QA scenarios, including API restart and backup; encrypted=%s',
  async (encrypted) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T17:00:00Z'))
    const f = await setup(encrypted)
    const debt = async (name: string, balance: number, apr: string | null) =>
      (
        await f.ok('POST', '/debts', {
          creditorName: name,
          accountType: 'auto_loan',
          currentBalanceCents: balance,
          minimumPaymentCents: 10000,
          interestRateApr: apr,
          dueDay: 5,
          nextDueDate: '2026-11-05',
          memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
        })
      ).debt
    const a = await debt('Fictional small loan', 100000, '12'),
      b = await debt('Fictional large loan', 200000, '24')
    const scenario = {
      name: 'Fictional comparison',
      startDate: '2026-10-20',
      strategy: 'snowball' as const,
      extraCents: 20000,
      availableCents: 40000,
      order: [],
      assumptions: [],
    }
    const initial = (await f.ok('GET', '/debt-planning')) as PlanningData
    const snow = simulatePayoff(initial.debts, scenario),
      avalanche = simulatePayoff(initial.debts, { ...scenario, strategy: 'avalanche' })
    // Independently checked using Decimal monthly half-up interest, minimums then extra.
    expect(snow).toMatchObject({ months: 9, interestCents: 25752, payoffDate: '2027-07-01' })
    expect(avalanche).toMatchObject({ months: 9, interestCents: 22296, payoffDate: '2027-07-01' })
    expect(snow.order[0].id).toBe(a.id)
    expect(avalanche.order[0].id).toBe(b.id)
    for (const strategy of ['snowball', 'avalanche'])
      await f.ok('POST', '/debt-planning/scenarios', create({ ...scenario, strategy }))
    const unknown = await debt('Fictional unknown APR', 50000, null)
    const incomplete = simulatePayoff((await f.ok('GET', '/debt-planning')).debts, scenario)
    expect(incomplete.complete).toBe(false)
    expect(incomplete.payoffDate).toBe(null)
    expect(incomplete.missing.some((d) => d.id === unknown.id)).toBe(true)
    expect(
      simulatePayoff((await f.ok('GET', '/debt-planning')).debts, {
        ...scenario,
        assumptions: [{ debtId: unknown.id, apr: '0' }],
      }).complete,
    ).toBe(true)
    expect((await f.ok('GET', '/debts/' + unknown.id)).debt.interestRateApr).toBe(null)
    await f.ok('DELETE', '/debts/' + unknown.id)

    const payment = (
      await f.ok('POST', `/debts/${a.id}/payments`, {
        idempotencyKey: randomUUID(),
        amountCents: 20000,
        paymentDate: '2026-10-10',
        paymentStatus: 'completed',
        paymentMethod: 'cash',
      })
    ).payment
    const offerBody = create({
      debtId: a.id,
      creditor: 'Fictional settlement creditor',
      originalBalanceCents: 100000,
      amountCents: 50000,
      offerDate: '2026-10-01',
      expirationDate: '2026-12-31',
      kind: 'lump_sum',
      status: 'accepted',
      writtenConfirmed: true,
      notes: null,
      document: null,
      schedule: [
        { id: randomUUID(), dueDate: '2026-11-05', amountCents: 50000, paymentId: payment.id },
      ],
    })
    const offer = (await f.ok('POST', '/debt-planning/offers', offerBody)).record
    await f.ok('POST', '/debt-planning/offers', offerBody)
    const planning = (await f.ok('GET', '/debt-planning')) as PlanningData
    expect(
      settlementProgress(planning.offers[0], planning.payments, localBillDate()),
    ).toMatchObject({ paidCents: 20000, remainingCents: 30000, savingsCents: 50000 })
    expect(planning.payments).toHaveLength(1)
    expect(planning.debts.find((d) => d.id === a.id)?.currentBalanceCents).toBe(100000)

    await f.ok('POST', '/bills', {
      name: 'Fictional loan obligation',
      category: 'Transportation',
      kind: 'recurring',
      amountType: 'fixed',
      amountCents: 15000,
      estimatedAmountCents: null,
      frequency: 'monthly',
      nextDueDate: '2026-11-05',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: a.id,
      memberIds: [f.member],
    })
    await f.ok('POST', `/debts/${a.id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: 5000,
      paymentDate: '2026-11-03',
      paymentStatus: 'scheduled',
      paymentMethod: 'cash',
    })
    const data = (await f.ok('GET', '/forecasts')) as ForecastData
    for (const [endDate, days, ending, outflow] of [
      ['2026-11-30', 30, -5000, 25000],
      ['2027-01-29', 90, -55000, 75000],
    ] as const) {
      const input = forecastInput(endDate),
        result = forecast(data.sources, input, localBillDate())
      expect(result.days).toHaveLength(days)
      expect(result).toMatchObject({
        endingCents: ending,
        outflowCents: outflow,
        incomeCents: 0,
        incomplete: false,
      })
      expect(result.shortfalls[0].date).toBe('2026-11-05')
      expect(result.days.find((d) => d.date === '2026-11-03')?.cashCents).toBe(15000)
      expect(
        result.events
          .filter((e) => e.date === '2026-11-05')
          .reduce((n, e) => n + (e.amountCents ?? 0), 0),
      ).toBe(20000)
      await f.ok('POST', '/forecasts', {
        idempotencyKey: randomUUID(),
        fingerprint: data.fingerprint,
        values: input,
      })
    }
    const openingUnknown = forecast(
      data.sources,
      { ...forecastInput('2026-11-30'), startingCents: null },
      localBillDate(),
    )
    expect(openingUnknown.endingCents).toBe(null)
    expect(openingUnknown.netChangeCents).toBe(-25000)

    const value = {
      valueCents: 500000,
      valuationDate: '2026-10-01',
      source: 'Fictional market estimate',
      confidence: 'estimated',
      notes: null,
      supersedesId: null,
    }
    const asset = (
      await f.ok(
        'POST',
        '/assets',
        create({
          name: 'Fictional QA vehicle',
          category: 'vehicle',
          memberIds: [f.member],
          debtIds: [a.id],
          acquisitionDate: null,
          purchaseCents: 900000,
          notes: null,
          status: 'active',
          valuation: value,
        }),
      )
    ).record
    const before = (await f.ok('GET', '/assets')) as AssetData,
      worth = netWorth(before, localBillDate(), null, localBillDate())
    expect(worth.assets[0].equityCents).toBe(400000)
    expect(worth).toMatchObject({
      assetCents: 500000,
      liabilityCents: 300000,
      subtotalCents: 200000,
      incomplete: false,
    })
    await f.ok('POST', '/assets/snapshots', {
      idempotencyKey: randomUUID(),
      memberId: null,
      fingerprint: before.fingerprint,
    })
    await f.ok('POST', `/assets/${asset.id}/valuations`, {
      idempotencyKey: randomUUID(),
      revision: 1,
      reason: 'Fictional updated estimate',
      values: { ...value, valueCents: 450000, valuationDate: localBillDate() },
    })
    const after = (await f.ok('GET', '/assets')) as AssetData
    expect(netWorth(after, localBillDate(), null, localBillDate()).subtotalCents).toBe(150000)
    expect(after.snapshots[0].report.subtotalCents).toBe(200000)
    expect(netWorth(after, '2026-10-01', null, localBillDate()).assetCents).toBe(500000)

    const dashboard = await f.ok('GET', '/overview?month=2026-10'),
      report = (await f.ok('POST', '/reports/preview', filter)) as FinancialReport
    expect(dashboard.actual).toMatchObject({
      cashOutflowCents: 20000,
      spendingCents: 0,
      transactionCount: 1,
    })
    expect(rows(report, 'Monthly income and spending')[0]).toMatchObject({
      cashOutflowCents: dashboard.actual.cashOutflowCents,
      purchaseSpendingCents: dashboard.actual.spendingCents,
      confirmedIncomeCents: dashboard.income.confirmedCents,
      netRecordedCashFlowCents: dashboard.income.netRecordedCashFlowCents,
    })
    expect(rows(report, 'Net worth subtotal')[0].knownSubtotalCents).toBe(150000)
    expect(rows(report, 'Saved forecast summaries')).toHaveLength(0)
    const futureReport = (await f.ok('POST', '/reports/preview', {
      ...filter,
      to: '2027-01-29',
    })) as FinancialReport
    expect(rows(futureReport, 'Saved forecast summaries')).toHaveLength(2)
    expect(rows(report, 'Settlement offers')[0]).toMatchObject({
      completedPaymentsCents: 20000,
      remainingCents: 30000,
    })
    expect(rows(report, 'Cash outflow history')).toHaveLength(1)
    expect(rows(report, 'Settlement offer change history')[0]).toMatchObject({
      status: 'accepted',
      amountCents: 50000,
    })
    for (const format of ['json', 'csv', 'xlsx', 'pdf']) {
      const result = await f.send('POST', '/reports/export', { filters: filter, format })
      expect(result.statusCode, result.body).toBe(200)
      expect(result.rawPayload.length).toBeGreaterThan(100)
      if (format === 'json')
        expect(JSON.parse(result.rawPayload.toString())).toMatchObject({
          schemaVersion: 1,
          restorable: false,
        })
      if (format === 'xlsx') {
        const book = new ExcelJS.Workbook()
        await book.xlsx.load(result.rawPayload as unknown as ExcelJS.Buffer)
        expect(book.worksheets.length).toBe(report.tables.length + 1)
        expect(book.worksheets[0].getCell('B1').text).toContain('Not a restorable')
      }
      if (format === 'csv') {
        const book = new ExcelJS.Workbook(),
          sheet = await book.csv.read(Readable.from([result.rawPayload]))
        expect(sheet.getCell('A1').text).toBe('Section')
        expect(sheet.rowCount).toBeGreaterThan(100)
      }
      if (format === 'pdf') {
        expect(result.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
        expect(result.rawPayload.toString('latin1')).toContain('%%EOF')
      }
      const destination = process.env.GOXFINANCE_QA_EXPORT_DIR
      if (destination) {
        mkdirSync(destination, { recursive: true })
        writeFileSync(
          join(destination, `new-module-qa-${encrypted ? 'encrypted' : 'plaintext'}.${format}`),
          result.rawPayload,
        )
      }
    }

    const actors = []
    for (const role of ['admin', 'editor', 'viewer']) {
      const actor = await testUser(f.app, role)
      f.grant(actor.id, role)
      actors.push({ ...actor, role })
    }
    const backupResult = await testRequest(f.app, 'POST', '/api/backups', f.owner.cookie, {})
    expect(backupResult.statusCode, backupResult.body).toBe(201)
    const backupPath = join(
      dirname(f.options.databasePath),
      'backups',
      backupResult.json().backup.id + '.sqlite',
    )
    expect(() => verifySnapshot(backupPath, f.options.databaseSecurity)).not.toThrow()
    if (encrypted) {
      expect(readFileSync(backupPath).subarray(0, 16).toString()).not.toBe('SQLite format 3\u0000')
      expect(() => verifySnapshot(backupPath)).toThrow()
      const wrong = randomBytes(32)
      try {
        expect(() => verifySnapshot(backupPath, { mode: 'encrypted', key: wrong })).toThrow()
      } finally {
        wrong.fill(0)
      }
    } else expect(readFileSync(backupPath).subarray(0, 16).toString()).toBe('SQLite format 3\u0000')
    const backup = openSqlite(backupPath, f.options.databaseSecurity, { readonly: true })
    try {
      expect(backup.pragma('foreign_key_check')).toEqual([])
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok')
      for (const [table, count] of [
        ['debts', 3],
        ['debt_payments', 2],
        ['settlement_offers', 1],
        ['assets', 1],
        ['asset_valuations', 2],
        ['net_worth_snapshots', 1],
        ['forecast_scenarios', 2],
      ])
        expect(backup.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: count })
    } finally {
      backup.close()
    }
    const next = await f.restart()
    const get = async (path: string, cookie = f.owner.cookie) => {
      const response = await testRequest(next, 'GET', f.base + path, cookie)
      expect(response.statusCode, response.body).toBe(200)
      return response.json()
    }
    expect((await get('/debt-planning')).offers[0].id).toBe(offer.id)
    expect((await get('/forecasts')).scenarios).toHaveLength(2)
    expect((await get('/assets')).snapshots[0].report.subtotalCents).toBe(200000)
    expect((await get('/overview?month=2026-10')).actual.cashOutflowCents).toBe(20000)
    for (const actor of actors) {
      expect(
        (
          await testRequest(next, 'PATCH', f.base + '/debts/' + a.id, actor.cookie, {
            currentBalanceCents: 1,
          })
        ).statusCode,
      ).toBe(403)
      expect((await get('/reports/options', actor.cookie)).debts).toHaveLength(0)
      expect((await testRequest(next, 'POST', '/api/backups', actor.cookie, {})).statusCode).toBe(
        403,
      )
    }
    const outsider = await testUser(next, 'outsider')
    expect((await testRequest(next, 'GET', f.base + '/assets', outsider.cookie)).statusCode).toBe(
      404,
    )
  },
  30000,
)
