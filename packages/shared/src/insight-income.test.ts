import { expect, it } from 'vitest'
import { incomeInsights } from './insight-income'
import { insightFixture } from './insights.fixture'
import { smartSource, smartIncome, smartWeek } from './smart-forecast.fixture'
import type { Insight, PayrollStatement } from './index'
function fixture() {
  const s = insightFixture()
  s.income.sources = [smartSource()]
  for (let n = 0; n < 4; n++) {
    const date = `2026-10-${String(1 + n * 5).padStart(2, '0')}`,
      id = 'pay' + n
    s.income.transactions.push(
      smartIncome({
        id,
        status: 'confirmed',
        depositDate: date,
        payDate: date,
        actualNetCents: 80000,
        confirmedAt: date + 'T12:00:00Z',
      }),
    )
    const statement = {
      payDate: date,
      grossCents: 100000,
      netCents: 80000,
      deductionsCents: 20000,
      deductionSign: 'negative',
      reportedWorkedHundredths: 4000,
      lines: [
        { code: 'federal', side: 'deduction', currentCents: -10000, ytdCents: -500000 },
        { code: 'roth', side: 'deduction', currentCents: -6000, ytdCents: -300000 },
      ],
    } as PayrollStatement
    s.payroll!.push(
      smartWeek({
        id: 'week' + n,
        incomeTransactionId: id,
        reviewedAt: date + 'T12:00:00Z',
        statementReceivedAt: date + 'T11:00:00Z',
        statement,
        forecasts: [
          {
            ...smartWeek().forecasts[0],
            eligibleForAccuracy: true,
            createdAt: '2026-09-01T10:00:00Z',
            result: { ...smartWeek().forecasts[0].result, netCents: 79000, deductions: [] },
          },
        ],
      }),
    )
  }
  return s
}
it('reports current federal/Roth once, not summed YTD, and only forward prediction accuracy', () => {
  const s = fixture(),
    out: Insight[] = []
  incomeInsights(s, '2026-10-20', (i) => out.push(i))
  expect(out.find((i) => i.title.endsWith('Federal withholding'))?.currentCents).toBe(10000)
  expect(out.find((i) => i.title.endsWith('Retirement deductions'))?.currentCents).toBe(6000)
  expect(out.find((i) => i.type === 'forecast_accuracy')).toMatchObject({
    currentCents: 1000,
    sampleCount: 4,
  })
  expect(out.find((i) => i.type === 'take_home_rate')?.changeBps).toBe(8000)
  s.payroll!.forEach((w) => {
    w.forecasts[0].createdAt = w.statementReceivedAt!
  })
  const late: Insight[] = []
  incomeInsights(s, '2026-10-20', (i) => late.push(i))
  expect(late.some((i) => i.type === 'forecast_accuracy')).toBe(false)
})
it('rejects post-deposit backdates and reconciled/backtest forecasts from accuracy', () => {
  const s = fixture()
  s.payroll!.forEach((w) => {
    w.forecasts[0].createdAt = w.statement!.payDate + 'T09:00:00Z'
  })
  const out: Insight[] = []
  incomeInsights(s, '2026-10-20', (i) => out.push(i))
  expect(out.some((i) => i.type === 'forecast_accuracy')).toBe(false)
  s.payroll!.forEach((w) => {
    w.forecasts[0].createdAt = '2026-09-01T10:00:00Z'
    w.forecasts[0].eligibleForAccuracy = false
  })
  const out2: Insight[] = []
  incomeInsights(s, '2026-10-20', (i) => out2.push(i))
  expect(out2.some((i) => i.type === 'forecast_accuracy')).toBe(false)
})
it('compares current withholding/retirement/OT by employer and equivalent periods without pooling YTD', () => {
  const s = fixture()
  s.payroll!.forEach((w, n) => {
    w.workweekStart = `2026-09-${String(1 + n * 7).padStart(2, '0')}`
    w.workweekEnd = `2026-09-${String(7 + n * 7).padStart(2, '0')}`
    w.payFrequency = 'weekly'
    w.statement!.lines[0].currentCents = -10000 - n * 1000
  })
  const out: Insight[] = []
  incomeInsights(s, '2026-10-20', (i) => out.push(i))
  expect(
    out.find((i) => i.type === 'payroll_line_trend' && i.id.endsWith(':federal')),
  ).toMatchObject({ currentCents: 12500, comparisonCents: 10500, sampleCount: 4 })
})
