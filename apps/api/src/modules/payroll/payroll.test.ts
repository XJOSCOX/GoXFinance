import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
import {
  incomeSourceSchema,
  incomeTransactionSchema,
  type PayrollStatement,
} from '@goxfinance/shared'
import { profile, hours } from '../../../../../packages/shared/src/payroll.fixture'
// Synthetic fixture only; no user statement or financial data is included.
const statement: PayrollStatement = {
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
async function fixture(encrypted = false) {
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
it.each([false, true])(
  'reviews one pending payroll deposit, confirms separately and preserves history on restart; encrypted=%s',
  async (encrypted) => {
    const f = await fixture(encrypted)
    expect(f.w.forecasts).toHaveLength(1)
    const saved = await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
      revision: f.w.revision,
      reason: 'Fictional verified statement',
      statement,
      documentDigest: 'a'.repeat(64),
    })
    expect(saved.stage).toBe('paystub_reviewed')
    const transactions = (await f.ok('GET', '/income')).transactions
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      status: 'pending',
      actualNetCents: 80000,
      depositDate: null,
    })
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(0)
    const values = incomeTransactionSchema.strip().parse({
      ...transactions[0],
      status: 'confirmed',
      receiptConfirmed: true,
      depositDate: '2026-10-16',
    })
    await f.ok('PATCH', '/income/transactions/' + transactions[0].id, {
      revision: transactions[0].revision,
      reason: 'Fictional actual deposit received',
      values,
    })
    expect((await f.ok('GET', '/income/payroll')).weeks[0].stage).toBe('deposit_confirmed')
    expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(80000)
    const next = await f.restart()
    const after = (
      await testRequest(next, 'GET', f.base + '/income/payroll', f.owner.cookie)
    ).json()
    expect(after.weeks[0]).toMatchObject({
      stage: 'deposit_confirmed',
      incomeTransactionId: transactions[0].id,
    })
    expect(after.weeks[0].statement.lines).toHaveLength(2)
    expect(after.weeks[0].forecasts).toEqual(f.w.forecasts)
  },
)
it('protects Owner payroll, cross-household access, stale changes, duplicate documents and duplicate workweeks', async () => {
  const f = await fixture(),
    viewer = await testUser(f.app, 'PayrollViewer')
  f.grant(viewer.id, 'viewer')
  expect((await f.ok('GET', '/income/payroll', undefined, viewer.cookie)).weeks).toHaveLength(0)
  expect(
    (
      await f.send(
        'POST',
        `/income/payroll/weeks/${f.w.id}/review`,
        { revision: 1, reason: 'Unauthorized', statement, documentDigest: null },
        viewer.cookie,
      )
    ).statusCode,
  ).toBe(403)
  const stranger = await testUser(f.app, 'PayrollOther')
  expect((await f.send('GET', '/income/payroll', undefined, stranger.cookie)).statusCode).toBe(404)
  expect(
    (
      await f.send('POST', '/income/payroll/weeks', {
        values: { ...hours, sourceId: f.source.id },
        idempotencyKey: randomUUID(),
        revision: 0,
        reason: 'Duplicate week',
        submit: false,
      })
    ).statusCode,
  ).toBe(409)
  await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
    revision: 1,
    reason: 'Fictional verified',
    statement,
    documentDigest: 'b'.repeat(64),
  })
  expect(
    (
      await f.send('POST', `/income/payroll/weeks/${f.w.id}/review`, {
        revision: 1,
        reason: 'Stale',
        statement,
        documentDigest: null,
      })
    ).statusCode,
  ).toBe(409)
  expect(
    (
      await f.send('POST', `/income/payroll/weeks/${f.w.id}/review`, {
        revision: 2,
        reason: 'Duplicate file',
        statement,
        documentDigest: 'b'.repeat(64),
      })
    ).statusCode,
  ).toBe(409)
})
it('learns only from reviewed prior periods and keeps model/forecast versions and rate snapshots immutable', async () => {
  const f = await fixture()
  const reviewed = await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
    revision: 1,
    reason: 'Synthetic actual',
    statement,
    documentDigest: null,
  })
  const rules = ['federal', 'social_security', 'medicare', 'state', 'local'].map((code) => ({
    code,
    label: code,
    applicable: code === 'federal',
    mode: code === 'federal' ? 'history' : 'unknown',
    fixedCents: null,
    rateBps: null,
    basis: 'gross',
    annualWageCapCents: null,
    priorTaxableWagesCents: null,
  }))
  expect(
    (
      await testRequest(f.app, 'PUT' as never, f.base + '/income/payroll/profile', f.owner.cookie, {
        revision: 1,
        reason: 'Configure source-specific learning',
        values: { ...profile, sourceId: f.source.id, rules },
      })
    ).statusCode,
  ).toBe(200)
  const nextHours = {
    ...hours,
    sourceId: f.source.id,
    workweekStart: '2026-10-19',
    workweekEnd: '2026-10-25',
    expectedPayDate: '2026-10-29',
    regularHundredths: 2000,
    overtimeHundredths: 0,
    ptoHundredths: 0,
  }
  const next = await f.ok('POST', '/income/payroll/weeks', {
    values: nextHours,
    idempotencyKey: randomUUID(),
    revision: 0,
    reason: 'Synthetic future hours',
    submit: false,
  })
  expect(next.forecasts[0].result).toMatchObject({ grossCents: 50000, netCents: 30000 })
  expect(
    next.forecasts[0].result.deductions.find((d: { code: string }) => d.code === 'federal'),
  ).toMatchObject({ sampleCount: 1, amountCents: 20000 })
  await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
    revision: reviewed.revision,
    reason: 'Synthetic historical correction',
    statement: {
      ...statement,
      deductionsCents: 15000,
      netCents: 85000,
      lines: statement.lines.map((l) =>
        l.side === 'deduction' ? { ...l, currentCents: 15000 } : l,
      ),
    },
    documentDigest: null,
  })
  const unchanged = (await f.ok('GET', '/income/payroll')).weeks.find(
    (w: { id: string }) => w.id === next.id,
  )
  expect(unchanged.forecasts).toEqual(next.forecasts)
  const revised = await f.ok('PATCH', `/income/payroll/weeks/${next.id}`, {
    values: nextHours,
    idempotencyKey: randomUUID(),
    revision: 1,
    reason: 'Refresh assumptions explicitly',
    submit: true,
  })
  expect(revised.forecasts).toHaveLength(2)
  expect(revised.forecasts[1].result.netCents).toBe(35000)
  expect((await f.ok('GET', '/income')).transactions).toHaveLength(1)
  expect((await f.ok('GET', '/income')).transactions[0].hourlyRateCents).toBe(2500)
})
it.each(['admin', 'editor', 'viewer'])(
  'cannot mutate or extract protected Owner payroll as %s',
  async (role) => {
    const f = await fixture(),
      actor = await testUser(f.app, 'Payroll' + role)
    f.grant(actor.id, role)
    const response = await f.send(
      'POST',
      `/income/payroll/weeks/${f.w.id}/extract`,
      {
        revision: 1,
        mime: 'application/pdf',
        data: Buffer.from('%PDF-1.7 fake').toString('base64'),
      },
      actor.cookie,
    )
    expect(response.statusCode).toBe(404)
    expect(
      (
        await f.send(
          'POST',
          `/income/payroll/weeks/${f.w.id}/review`,
          { revision: 1, statement, documentDigest: null, reason: 'Unauthorized' },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
  },
)
it('preserves confirmed cash on a statement correction and audits a separate deposit correction', async () => {
  const f = await fixture(),
    saved = await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
      revision: 1,
      reason: 'Synthetic actual',
      statement,
      documentDigest: null,
    })
  const t = (await f.ok('GET', '/income')).transactions[0]
  await f.ok('PATCH', '/income/transactions/' + t.id, {
    revision: t.revision,
    reason: 'Synthetic received deposit',
    values: incomeTransactionSchema
      .strip()
      .parse({ ...t, status: 'confirmed', receiptConfirmed: true, depositDate: '2026-10-16' }),
  })
  const w = (await f.ok('GET', '/income/payroll')).weeks[0]
  await f.ok('POST', `/income/payroll/weeks/${saved.id}/review`, {
    revision: w.revision,
    reason: 'Synthetic document correction',
    documentDigest: null,
    statement: {
      ...statement,
      netCents: 85000,
      deductionsCents: 15000,
      lines: statement.lines.map((l) =>
        l.side === 'deduction' ? { ...l, currentCents: 15000 } : l,
      ),
    },
  })
  expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(80000)
  const updated = (await f.ok('GET', '/income')).transactions[0]
  await f.ok('PATCH', '/income/transactions/' + updated.id, {
    revision: updated.revision,
    reason: 'Synthetic corrected actual receipt',
    values: incomeTransactionSchema.strip().parse({ ...updated, actualNetCents: 85000 }),
  })
  expect((await f.ok('GET', '/overview?month=2026-10')).income.confirmedCents).toBe(85000)
  const audit = await f.ok('GET', `/income/payroll/sources/${f.source.id}/audit`)
  expect(
    audit.audit.filter((a: { action: string }) => a.action === 'paystub_reviewed'),
  ).toHaveLength(2)
  expect(
    audit.audit.filter((a: { action: string }) => a.action === 'deposit_confirmed'),
  ).toHaveLength(2)
})
