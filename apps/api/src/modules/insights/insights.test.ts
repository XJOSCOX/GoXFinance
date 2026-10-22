import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
import { openSqlite, hasPlaintextHeader } from '../../db/encryption/sqlite-engine'
import {
  createSnapshot,
  verifySnapshot,
  queueRestore,
  restoreQueuedSnapshot,
} from '../../db/sqlite-backups'
import { localBillDate, type InsightsData } from '@goxfinance/shared'
import { join, dirname } from 'node:path'
const date = () => localBillDate()
async function seed(encrypted = false) {
  const f = await setup(encrypted)
  await f.ok('POST', '/expenses/initialize')
  const categories = (await f.ok('GET', '/categories')).categories,
    category = categories.find((c: { name: string }) => /dining/i.test(c.name)) ?? categories[0]
  const expense = {
    description: 'Fictional review purchase',
    merchant: 'Fictional recurring service',
    amountCents: 2000,
    transactionDate: date(),
    responsibleMemberId: f.member,
    paymentMethod: 'debit_card',
    linkedDebtId: null,
    notes: null,
    allocations: [{ categoryId: category.id, amountCents: 2000 }],
  }
  const one = (await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense })).expense
  await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense })
  return { ...f, category, expense, one }
}
const body = (d: InsightsData, id: string, kind: 'feedback' | 'plan' = 'feedback') => ({
  idempotencyKey: randomUUID(),
  fingerprint: d.fingerprint,
  revision: 0,
  values:
    kind === 'feedback'
      ? { kind, insightId: id, status: 'dismissed' }
      : {
          kind,
          insightId: id,
          status: 'planned',
          startDate: date(),
          endDate: date(),
          reductionCents: null,
          notes: 'Fictional review only',
        },
})
it.each([false, true])(
  'persists metadata through restart and disposable restore; preserves all financial rows; encrypted=%s',
  async (encrypted) => {
    const f = await seed(encrypted),
      d = (await f.ok('GET', '/insights')) as InsightsData,
      i = d.report.insights.find((i) => i.type === 'duplicate_review')!
    expect(i).toBeTruthy()
    const sql = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    const financialTables = [
        'income_transactions',
        'expenses',
        'bill_payments',
        'debt_payments',
        'budget_months',
        'bank_transactions',
        'forecast_scenarios',
        'financial_goals',
      ],
      before = financialTables.map((t) => sql.prepare('SELECT * FROM ' + t).all())
    const request = body(d, i.id, 'plan'),
      saved = await f.ok('POST', '/insights/actions', request)
    expect((await f.ok('POST', '/insights/actions', request)).id).toBe(saved.id)
    expect(
      (
        await f.send('POST', '/insights/actions', {
          ...request,
          values: { ...request.values, notes: 'Conflicting replay' },
        })
      ).statusCode,
    ).toBe(409)
    let read = (await f.ok('GET', '/insights')) as InsightsData
    expect(read.plans[0]).toMatchObject({
      id: saved.id,
      revision: 1,
      achievedSavingsCents: null,
      observedSpendingCents: null,
    })
    await f.ok('POST', '/insights/actions', {
      ...request,
      idempotencyKey: randomUUID(),
      revision: 1,
      values: { ...read.plans[0].values, status: 'completed' },
    })
    const audit = await f.ok('GET', `/insights/actions/${saved.id}/audit`)
    expect(
      audit.history.map(
        (event: { details: { after: { revision: number } } }) => event.details.after.revision,
      ),
    ).toEqual([1, 2])
    expect(
      (
        await f.send('POST', '/insights/actions', {
          ...request,
          idempotencyKey: randomUUID(),
          revision: 1,
        })
      ).statusCode,
    ).toBe(409)
    expect(financialTables.map((t) => sql.prepare('SELECT * FROM ' + t).all())).toEqual(before)
    expect(sql.pragma('foreign_key_check')).toEqual([])
    expect(sql.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(() => sql.exec('DELETE FROM insight_audit')).toThrow('immutable')
    expect(() => sql.exec("UPDATE insight_records SET snapshot_json='{}'")).toThrow('immutable')
    expect(() => sql.exec("UPDATE insight_audit SET digest='changed'")).toThrow('immutable')
    const snapshot = createSnapshot(sql, f.options.databasePath, f.owner.id, 'manual')
    sql.close()
    const next = await f.restart()
    read = (await testRequest(next, 'GET', f.base + '/insights', f.owner.cookie)).json()
    expect(read.plans[0]).toMatchObject({
      revision: 2,
      values: { status: 'completed' },
      achievedSavingsCents: null,
    })
    // Recover into the disposable fixture only; never the configured runtime database.
    await next.close()
    queueRestore(f.options.databasePath, snapshot.id, f.owner.id, f.options.databaseSecurity)
    expect(await restoreQueuedSnapshot(f.options.databasePath, f.options.databaseSecurity)).toBe(
      true,
    )
    const restored = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    expect(
      restored.prepare('SELECT revision FROM insight_records WHERE id=?').get(saved.id),
    ).toEqual({ revision: 2 })
    expect(financialTables.map((t) => restored.prepare('SELECT * FROM ' + t).all())).toEqual(before)
    expect(restored.prepare('SELECT count(*) n FROM sessions').get()).toEqual({ n: 0 })
    restored.close()
    const backupPath = join(dirname(f.options.databasePath), 'backups', snapshot.id + '.sqlite')
    verifySnapshot(backupPath, f.options.databaseSecurity)
    if (encrypted) expect(hasPlaintextHeader(backupPath)).toBe(false)
  },
  20000,
)
it('isolates Owner evidence, private source references, feedback actors and cross-household requests', async () => {
  const f = await seed(),
    ownerData = (await f.ok('GET', '/insights')) as InsightsData,
    i = ownerData.report.insights.find((i) => i.type === 'duplicate_review')!
  const editor = await testUser(f.app, 'Editor')
  const member = f.grant(editor.id, 'editor')
  const scoped = (await f.ok('GET', '/insights', undefined, editor.cookie)) as InsightsData
  expect(scoped.report.privacyLimited).toBe(true)
  expect(JSON.stringify(scoped)).not.toContain(f.one.id)
  expect(JSON.stringify(scoped)).not.toContain('Fictional recurring service')
  expect(
    (await f.send('POST', '/insights/actions', body(scoped, i.id), editor.cookie)).statusCode,
  ).toBe(404)
  const own = {
    ...f.expense,
    responsibleMemberId: member,
    description: 'Editor-only purchase',
    merchant: 'Editor service',
  }
  await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense: own }, editor.cookie)
  await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense: own }, editor.cookie)
  const data = (await f.ok('GET', '/insights', undefined, editor.cookie)) as InsightsData,
    ownInsight = data.report.insights.find((i) => i.type === 'duplicate_review')!,
    saved = await f.ok(
      'POST',
      '/insights/actions',
      body(data, ownInsight.id, 'plan'),
      editor.cookie,
    )
  expect((await f.ok('GET', '/insights')).plans).toHaveLength(0)
  expect((await f.send('GET', `/insights/actions/${saved.id}/audit`)).statusCode).toBe(404)
  const sql = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  sql.prepare('UPDATE household_members SET linked_user_id=NULL WHERE id=?').run(member)
  sql.close()
  expect((await f.send('GET', '/insights', undefined, editor.cookie)).statusCode).toBe(403)
  const viewer = await testUser(f.app, 'Viewer')
  f.grant(viewer.id, 'viewer')
  expect(
    (await f.send('POST', '/insights/actions', body(ownerData, i.id), viewer.cookie)).statusCode,
  ).toBe(403)
  const stranger = await testUser(f.app, 'Stranger')
  expect((await f.send('GET', '/insights', undefined, stranger.cookie)).statusCode).toBe(404)
  expect((await f.send('GET', '/insights', undefined, '')).statusCode).toBe(401)
})
it('recalculates corrections, rejects stale sources, retains significant risks despite dismissal, and hides revoked saved references', async () => {
  const f = await seed(),
    d = (await f.ok('GET', '/insights')) as InsightsData,
    i = d.report.insights.find((i) => i.type === 'duplicate_review')!
  const feedback = body(d, i.id)
  await f.ok('POST', '/insights/actions', feedback)
  expect(
    (await f.ok('GET', '/insights')).report.insights.find((n: { id: string }) => n.id === i.id),
  ).toMatchObject({ feedback: 'dismissed', priority: 'important' })
  const saved = await f.ok('POST', '/insights/actions', body(d, i.id, 'plan'))
  const changed = {
    ...f.expense,
    amountCents: 3000,
    allocations: [{ categoryId: f.category.id, amountCents: 3000 }],
  }
  await f.ok('PATCH', '/expenses/' + f.one.id, { revision: 1, expense: changed })
  expect(
    (
      await f.send('POST', '/insights/actions', {
        ...feedback,
        idempotencyKey: randomUUID(),
        revision: 1,
      })
    ).statusCode,
  ).toBe(409)
  const fresh = (await f.ok('GET', '/insights')) as InsightsData
  expect(fresh.plans[0]).toMatchObject({ stale: true, insight: { currentCents: 2000 } })
  expect(fresh.report.insights.some((n) => n.id === i.id)).toBe(false)
  await f.ok('DELETE', '/expenses/' + f.one.id, { revision: 2 })
  expect((await f.ok('GET', '/insights')).plans).toEqual([])
  expect((await f.send('GET', `/insights/actions/${saved.id}/audit`)).statusCode).toBe(404)
})
it('atomically rolls back if immutable audit insertion fails and retains CSRF protection', async () => {
  const f = await seed(),
    d = (await f.ok('GET', '/insights')) as InsightsData,
    i = d.report.insights.find((i) => i.type === 'duplicate_review')!,
    sql = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  sql.exec(
    "CREATE TRIGGER fictional_reject_insight BEFORE INSERT ON insight_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
  )
  expect((await f.send('POST', '/insights/actions', body(d, i.id, 'plan'))).statusCode).toBe(500)
  expect(sql.prepare('SELECT count(*) n FROM insight_records').get()).toEqual({ n: 0 })
  sql.close()
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: f.base + '/insights/actions',
        headers: { cookie: f.owner.cookie },
        payload: body(d, i.id),
      })
    ).statusCode,
  ).toBe(403)
})
it('previews explicit spending reductions, keeps savings unverified, and never edits a budget', async () => {
  const f = await seed(),
    month = date().slice(0, 7)
  await f.ok('POST', '/budgets', {
    idempotencyKey: randomUUID(),
    values: {
      month,
      responsibleMemberId: null,
      totalCents: 20000,
      status: 'active',
      notes: null,
      limits: [{ categoryId: f.category.id, amountCents: 20000 }],
    },
  })
  let d = (await f.ok('GET', '/insights')) as InsightsData,
    i = d.report.insights.find((i) => i.type === 'budget_review')!
  expect(i).toBeTruthy()
  const endDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10)
  let p = {
    ...body(d, i.id, 'plan'),
    values: {
      kind: 'plan',
      insightId: i.id,
      status: 'planned',
      startDate: date(),
      endDate,
      reductionCents: 1000,
      notes: 'Fictional smaller allowance',
    },
  }
  expect((await f.ok('POST', '/insights/preview', p)).scenario.improvementCents).toBeNull()
  const forecast = await f.ok('GET', '/forecasts')
  const put = await testRequest(
    f.app,
    'PUT' as never,
    f.base + '/forecasts/preferences',
    f.owner.cookie,
    {
      idempotencyKey: randomUUID(),
      revision: 0,
      fingerprint: forecast.fingerprint,
      reason: 'Fictional same-day opening',
      includeRecordedSameDayActivity: true,
      values: {
        bufferCents: 0,
        opening: {
          amountCents: 100000,
          effectiveAt: date() + 'T00:00:00-05:00',
          effectiveDate: date(),
          source: 'user_confirmed',
          confidence: 'confirmed',
          confirmed: true,
          accounts: [],
          includedActivityIds: [],
        },
      },
    },
  )
  expect(put.statusCode, put.body).toBe(200)
  d = (await f.ok('GET', '/insights')) as InsightsData
  i = d.report.insights.find((i) => i.type === 'budget_review')!
  p = { ...p, fingerprint: d.fingerprint }
  const preview = await f.ok('POST', '/insights/preview', p)
  expect(preview.scenario.improvementCents).toBe(1000)
  const budgetBefore = await f.ok('GET', `/budgets?month=${month}`)
  await f.ok('POST', '/insights/actions', p)
  expect(await f.ok('GET', `/budgets?month=${month}`)).toEqual(budgetBefore)
  expect((await f.ok('GET', '/insights')).plans[0].achievedSavingsCents).toBeNull()
  const currentForecast = await f.ok('GET', '/forecasts')
  const revised = await testRequest(
    f.app,
    'PUT' as never,
    f.base + '/forecasts/preferences',
    f.owner.cookie,
    {
      idempotencyKey: randomUUID(),
      revision: 1,
      fingerprint: currentForecast.fingerprint,
      reason: 'Fictional revised buffer',
      includeRecordedSameDayActivity: true,
      values: { opening: currentForecast.settings.opening, bufferCents: 5000 },
    },
  )
  expect(revised.statusCode, revised.body).toBe(200)
  expect((await f.ok('GET', '/insights')).plans[0]).toMatchObject({
    stale: true,
    achievedSavingsCents: null,
  })

  expect(
    (
      await f.send('POST', '/insights/preview', {
        ...p,
        fingerprint: (await f.ok('GET', '/insights')).fingerprint,
        values: { ...p.values, reductionCents: 20001 },
      })
    ).statusCode,
  ).toBe(400)
  const sql = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    expect(() =>
      sql
        .prepare("UPDATE household_user_roles SET role='editor' WHERE household_id=? AND user_id=?")
        .run(f.home, f.owner.id),
    ).toThrow('Protected household owner')
  } finally {
    sql.close()
  }
})
it('tracks later actual purchases while preserving accepted assumptions and original context', async () => {
  const f = await seed(),
    month = date().slice(0, 7)
  await f.ok('POST', '/budgets', {
    idempotencyKey: randomUUID(),
    values: {
      month,
      responsibleMemberId: null,
      totalCents: 20000,
      status: 'active',
      notes: null,
      limits: [{ categoryId: f.category.id, amountCents: 20000 }],
    },
  })
  const d = (await f.ok('GET', '/insights')) as InsightsData,
    i = d.report.insights.find((i) => i.type === 'budget_review')!,
    values = body(d, i.id, 'plan'),
    saved = await f.ok('POST', '/insights/actions', values)
  await f.ok('POST', '/expenses', {
    idempotencyKey: randomUUID(),
    expense: {
      ...f.expense,
      merchant: 'New actual purchase',
      description: 'After plan acceptance',
      amountCents: 1500,
      allocations: [{ categoryId: f.category.id, amountCents: 1500 }],
    },
  })
  const read = (await f.ok('GET', '/insights')) as InsightsData,
    plan = read.plans.find((p) => p.id === saved.id)!
  expect(plan).toMatchObject({
    observedSpendingCents: 1500,
    observedCount: 1,
    achievedSavingsCents: null,
    stale: true,
  })
  expect(
    (
      await f.send('POST', '/insights/actions', {
        ...values,
        fingerprint: read.fingerprint,
        idempotencyKey: randomUUID(),
        revision: 1,
        values: { ...plan.values, reductionCents: 1000 },
      })
    ).statusCode,
  ).toBe(409)
  const audit = await f.ok('GET', `/insights/actions/${saved.id}/audit`)
  expect(audit.history).toHaveLength(1)
  expect(JSON.parse(audit.history[0].details.after.snapshotJson).insight).toMatchObject({
    comparisonCents: 20000,
  })
})
