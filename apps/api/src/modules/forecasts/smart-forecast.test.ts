import { visibleForecastSettings } from './forecast-settings'
import { smartSources, smartInput } from '../../../../../packages/shared/src/smart-forecast.fixture'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { expect, it } from 'vitest'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
import { fixture, statement } from '../payroll/payroll.fixture'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import { verifySnapshot } from '../../db/sqlite-backups'
import { localBillDate } from '@goxfinance/shared'

const preferences = (fingerprint: string, revision = 0) => ({
  fingerprint,
  revision,
  idempotencyKey: randomUUID(),
  reason: 'Fictional available cash confirmation',
  includeRecordedSameDayActivity: true,
  values: {
    bufferCents: 25000,
    opening: {
      amountCents: 100000,
      effectiveAt: `${localBillDate()}T00:00:00-05:00`,
      effectiveDate: localBillDate(),
      source: 'user_confirmed',
      confidence: 'confirmed',
      confirmed: true,
      accounts: [],
      includedActivityIds: [],
    },
  },
})

it.each([false, true])(
  'persists audited settings and immutable snapshots, verifies backup and restart; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      initial = await f.ok('GET', '/forecasts'),
      payload = preferences(initial.fingerprint)
    const put = (body: object) =>
      testRequest(f.app, 'PUT' as never, f.base + '/forecasts/preferences', f.owner.cookie, body)
    const saved = await put(payload)
    expect(saved.statusCode, saved.body).toBe(200)
    expect((await put(payload)).json().settings.id).toBe(saved.json().settings.id)
    expect(
      (await put({ ...payload, values: { ...payload.values, bufferCents: 30000 } })).statusCode,
    ).toBe(409)
    const data = await f.ok('GET', '/forecasts'),
      smart = await f.ok('GET', '/forecasts/smart?days=30')
    expect(smart.report).toMatchObject({
      endingCents: 100000,
      smart: { bufferCents: 25000, health: 'within_plan' },
    })
    const body = {
      idempotencyKey: randomUUID(),
      fingerprint: data.fingerprint,
      values: smart.input,
    }
    const snapshot = (await f.ok('POST', '/forecasts', body)).record
    expect((await f.ok('POST', '/forecasts', body)).record.id).toBe(snapshot.id)
    const previous = (await f.ok('GET', '/forecasts')).scenarios[0]
    const nextPayload = preferences(data.fingerprint, 1)
    nextPayload.values.bufferCents = 200000
    expect((await put(nextPayload)).statusCode).toBe(200)
    expect((await f.ok('GET', '/forecasts')).scenarios[0]).toEqual(previous)
    expect((await f.ok('GET', '/forecasts/smart?days=7')).report.smart.daysBelowBuffer).toBe(7)
    const backup = await testRequest(f.app, 'POST', '/api/backups', f.owner.cookie, {})
    expect(backup.statusCode, backup.body).toBe(201)
    expect(() =>
      verifySnapshot(
        join(dirname(f.options.databasePath), 'backups', `${backup.json().backup.id}.sqlite`),
        f.options.databaseSecurity,
      ),
    ).not.toThrow()
    const next = await f.restart(),
      after = (await testRequest(next, 'GET', f.base + '/forecasts', f.owner.cookie)).json()
    expect(after.settings).toMatchObject({
      revision: 2,
      bufferCents: 200000,
      opening: { amountCents: 100000 },
    })
    expect(after.scenarios[0]).toEqual(previous)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.prepare('SELECT COUNT(*) AS n FROM forecast_settings_versions').get()).toEqual({
        n: 2,
      })
      expect(() => db.exec("UPDATE forecast_settings_versions SET reason='changed'")).toThrow(
        'immutable',
      )
      expect(() => db.exec('DELETE FROM forecast_settings_versions')).toThrow('immutable')
    } finally {
      db.close()
    }
  },
)

it('rejects stale settings, invalid opening cash, cross-household access and Viewer mutations', async () => {
  const f = await setup(false),
    data = await f.ok('GET', '/forecasts'),
    payload = preferences(data.fingerprint)
  const viewer = await testUser(f.app, 'CashViewer')
  f.grant(viewer.id, 'viewer')
  const stranger = await testUser(f.app, 'CashStranger')
  const put = (body: object, cookie = f.owner.cookie) =>
    testRequest(f.app, 'PUT' as never, f.base + '/forecasts/preferences', cookie, body)
  expect((await put(payload, viewer.cookie)).statusCode).toBe(403)
  expect((await f.send('GET', '/forecasts/smart', undefined, stranger.cookie)).statusCode).toBe(404)
  expect((await put(payload, stranger.cookie)).statusCode).toBe(404)
  expect((await put({ ...payload, fingerprint: '0'.repeat(64) })).statusCode).toBe(409)
  expect(
    (
      await put({
        ...payload,
        values: {
          ...payload.values,
          opening: {
            ...payload.values.opening,
            source: 'selected_accounts',
            accounts: [
              { accountId: randomUUID(), balanceId: randomUUID(), availableCents: 100000 },
            ],
          },
        },
      })
    ).statusCode,
  ).toBe(409)
  expect((await put(payload)).statusCode).toBe(200)
  expect((await put({ ...payload, idempotencyKey: randomUUID() })).statusCode).toBe(409)
  expect((await f.send('GET', '/forecasts/smart?days=100')).statusCode).toBe(400)
  expect(
    (await f.ok('GET', '/forecasts/smart', undefined, viewer.cookie)).report.smart.openingRequired,
  ).toBe(false)
})

it.each(['admin', 'editor'])(
  'allows %s planning, hides protected Owner payroll and saved payroll snapshots',
  async (role) => {
    const f = await fixture(),
      colleague = await testUser(f.app, 'Cash' + role)
    f.grant(colleague.id, role)
    await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
      revision: f.w.revision,
      reason: 'Fictional statement review',
      statement,
      documentDigest: null,
    })
    const own = await f.ok('GET', '/forecasts'),
      smart = await f.ok('GET', '/forecasts/smart')
    expect(
      smart.report.events.filter(
        (e: { reference?: { type: string } }) => e.reference?.type === 'payroll',
      ),
    ).toHaveLength(1)
    await f.ok('POST', '/forecasts', {
      idempotencyKey: randomUUID(),
      fingerprint: own.fingerprint,
      values: smart.input,
    })
    const permitted = await f.ok('GET', '/forecasts', undefined, colleague.cookie)
    expect(permitted.sources.income.sources).toEqual([])
    expect(permitted.sources.payroll).toEqual([])
    expect(permitted.scenarios).toEqual([])
    expect(permitted.sources.privacyLimited).toBe(true)
    const response = await testRequest(
      f.app,
      'PUT' as never,
      f.base + '/forecasts/preferences',
      colleague.cookie,
      preferences(permitted.fingerprint),
    )
    expect(response.statusCode, response.body).toBe(200)
    const newData = await f.ok('GET', '/forecasts', undefined, colleague.cookie),
      ownPlan = await f.ok('GET', '/forecasts/smart', undefined, colleague.cookie)
    expect(ownPlan.report.incomeCents).toBe(0)
    expect(ownPlan.report.incomplete).toBe(true)
    expect(
      (
        await f.send(
          'POST',
          '/forecasts',
          { idempotencyKey: randomUUID(), fingerprint: newData.fingerprint, values: ownPlan.input },
          colleague.cookie,
        )
      ).statusCode,
    ).toBe(200)
    expect((await f.ok('GET', '/income/payroll')).weeks[0].forecasts).toEqual(f.w.forecasts)
  },
)

it('rolls back a rejected cash-confirmation write without saving a partial version', async () => {
  const f = await setup(false),
    data = await f.ok('GET', '/forecasts'),
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_cash BEFORE INSERT ON forecast_settings_versions BEGIN SELECT RAISE(ABORT,'fictional failed write');END;",
    )
    const response = await testRequest(
      f.app,
      'PUT' as never,
      f.base + '/forecasts/preferences',
      f.owner.cookie,
      preferences(data.fingerprint),
    )
    expect(response.statusCode).toBe(500)
    expect((await f.ok('GET', '/forecasts')).settings).toBeNull()
  } finally {
    db.close()
  }
})

it('accepts only visible, current available account balances and keeps private cash confirmations hidden', async () => {
  const f = await setup(false)
  const account = (
    await f.ok('POST', '/banking/accounts', {
      idempotencyKey: randomUUID(),
      values: {
        name: 'Fictional cash account',
        institution: 'Fictional manual bank',
        type: 'checking',
        subtype: null,
        mask: '1234',
        currency: 'USD',
        memberIds: [f.member],
        status: 'active',
        assetId: null,
        debtId: null,
      },
    })
  ).record
  await f.ok('POST', `/banking/accounts/${account.id}/balances`, {
    idempotencyKey: randomUUID(),
    values: {
      currentCents: 500000,
      availableCents: 12345,
      observedAt: new Date(Date.now() - 1000).toISOString(),
      notes: 'Synthetic balance only',
    },
  })
  const data = await f.ok('GET', '/forecasts'),
    balance = data.sources.cashAccounts[0].balance
  const body = preferences(data.fingerprint)
  Object.assign(body.values.opening, {
    source: 'selected_accounts',
    amountCents: 12345,
    accounts: [{ accountId: account.id, balanceId: balance.id, availableCents: 12345 }],
  })
  const put = (payload: object, cookie = f.owner.cookie) =>
    testRequest(f.app, 'PUT' as never, f.base + '/forecasts/preferences', cookie, payload)
  expect(
    (
      await put({
        ...body,
        values: { ...body.values, opening: { ...body.values.opening, amountCents: 500000 } },
      })
    ).statusCode,
  ).toBe(400)
  expect((await put(body)).statusCode).toBe(200)
  const colleague = await testUser(f.app, 'PrivateCashEditor')
  f.grant(colleague.id, 'editor')
  const hidden = await f.ok('GET', '/forecasts', undefined, colleague.cookie)
  expect(hidden.sources.cashAccounts).toEqual([])
  expect(hidden.settings.opening).toBeNull()
  expect(
    (
      await put(
        { ...body, idempotencyKey: randomUUID(), revision: 1, fingerprint: hidden.fingerprint },
        colleague.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect((await f.ok('GET', '/forecasts')).settings.opening.amountCents).toBe(12345)
  const kept = {
    ...preferences(hidden.fingerprint, 1),
    keepOpening: true,
    values: { opening: null, bufferCents: 50000 },
  }
  const keptResult = await put(kept, colleague.cookie)
  expect(keptResult.statusCode, keptResult.body).toBe(200)
  expect(keptResult.json().settings.opening).toBeNull()
  expect((await put(kept, colleague.cookie)).statusCode).toBe(200)
  const current = await f.ok('GET', '/forecasts')
  expect(current.settings.opening.amountCents).toBe(12345)
  await f.ok('POST', `/banking/accounts/${account.id}/balances`, {
    idempotencyKey: randomUUID(),
    values: {
      currentCents: 500000,
      availableCents: 15000,
      observedAt: new Date().toISOString(),
      notes: 'Changed fictional balance',
    },
  })
  const changed = await f.ok('GET', '/forecasts')
  expect(changed.fingerprint).not.toBe(current.fingerprint)
  expect(
    (
      await put({
        ...body,
        idempotencyKey: randomUUID(),
        revision: 1,
        fingerprint: changed.fingerprint,
      })
    ).statusCode,
  ).toBe(409)
})

it('does not expose private payroll activity IDs through household cash confirmations', () => {
  const opening = smartInput().smart!.opening!
  opening.includedActivityIds = ['income:private-owner-deposit']
  expect(
    visibleForecastSettings(
      {
        id: randomUUID(),
        revision: 1,
        createdAt: new Date().toISOString(),
        opening,
        bufferCents: 0,
      },
      smartSources(),
    )!.opening!.includedActivityIds,
  ).toEqual([])
})
