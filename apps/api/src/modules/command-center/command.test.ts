import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  commandCenterSchema,
  commandPreferencesSchema,
  type CommandCenter,
  localBillDate,
} from '@goxfinance/shared'
import { fixture } from '../payroll/payroll.fixture'
import { testUser, testRequest } from '../../testing/workspace'
import { openSqlite, hasPlaintextHeader } from '../../db/encryption/sqlite-engine'
import { createSnapshot, verifySnapshot } from '../../db/sqlite-backups'
import { join, dirname } from 'node:path'
const preferences = commandPreferencesSchema.parse({
  periodDays: 30,
  compact: false,
  expanded: ['timeline'],
  quickActions: ['bills'],
  indicators: ['budget'],
})
it.each([false, true])(
  'reads without changing any financial tables; preferences and snapshots persist; encrypted=%s',
  async (encrypted) => {
    const f = await fixture(encrypted),
      sql = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    const tables = (
      sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','command_preferences') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((r) => r.name)
    const before = tables.map((t) => sql.prepare('SELECT * FROM "' + t + '"').all())
    const get = () => f.ok('GET', '/command-center') as Promise<CommandCenter>
    const d = commandCenterSchema.parse(await get())
    expect(d.schemaVersion).toBe(1)
    expect(d.cash.status).toBe('missing')
    expect(d.owner).toBe(true)
    expect(d).not.toHaveProperty('sources')
    expect(d).not.toHaveProperty('documents')
    await get()
    await f.ok('GET', '/command-center?month=2026-09')
    expect(tables.map((t) => sql.prepare('SELECT * FROM "' + t + '"').all())).toEqual(before)
    const body = { revision: 0, idempotencyKey: randomUUID(), values: preferences }
    const put = (b = body) =>
      testRequest(f.app, 'PUT' as never, f.base + '/command-center/preferences', f.owner.cookie, b)
    expect((await put()).statusCode).toBe(200)
    expect((await put()).json().revision).toBe(1)
    expect((await put({ ...body, values: { ...preferences, compact: true } })).statusCode).toBe(409)
    expect((await put({ ...body, idempotencyKey: randomUUID() })).statusCode).toBe(409)
    expect((await get()).preferences).toEqual(preferences)
    expect(tables.map((t) => sql.prepare('SELECT * FROM "' + t + '"').all())).toEqual(before)
    expect(() => sql.exec('DELETE FROM command_preferences')).toThrow('immutable')
    expect(() => sql.exec('UPDATE command_preferences SET revision=3')).toThrow('immutable')
    const backup = createSnapshot(sql, f.options.databasePath, f.owner.id, 'manual')
    sql.close()
    const backupPath = join(dirname(f.options.databasePath), 'backups', backup.id + '.sqlite')
    verifySnapshot(backupPath, f.options.databaseSecurity)
    expect(hasPlaintextHeader(backupPath)).toBe(!encrypted)
    const app = await f.restart()
    const resumed = (
      await testRequest(app, 'GET', f.base + '/command-center', f.owner.cookie)
    ).json() as CommandCenter
    expect(resumed.preferences).toEqual(preferences)
    expect(resumed.preferenceRevision).toBe(1)
    const reopened = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    expect(tables.map((t) => reopened.prepare('SELECT * FROM "' + t + '"').all())).toEqual(before)
    expect(reopened.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(reopened.pragma('foreign_key_check')).toEqual([])
    reopened.close()
  },
  20000,
)
it('filters private payroll before computing; protects cash and actor preferences; rejects CSRF and nonmembers', async () => {
  const f = await fixture(),
    editor = await testUser(f.app, 'Editor'),
    viewer = await testUser(f.app, 'Viewer'),
    stranger = await testUser(f.app, 'Stranger')
  f.grant(editor.id, 'editor')
  f.grant(viewer.id, 'viewer')
  for (const actor of [editor, viewer]) {
    const d = (await f.ok('GET', '/command-center', undefined, actor.cookie)) as CommandCenter
    expect(d.owner).toBe(false)
    expect(d.cash.amountCents).toBeNull()
    expect(d.paycheck).toBeNull()
    expect(JSON.stringify(d)).not.toContain(f.source.id)
    expect(JSON.stringify(d)).not.toContain('Fictional weekly payroll')
    expect(d.canManage).toBe(actor === editor)
    expect(d.accounting.receivedCents).toBe(0)
  }
  const put = (cookie: string, origin = 'http://localhost:1420') =>
    testRequest(
      f.app,
      'PUT' as never,
      f.base + '/command-center/preferences',
      cookie,
      { revision: 0, idempotencyKey: randomUUID(), values: preferences },
      origin,
    )
  expect((await put(viewer.cookie)).statusCode).toBe(200)
  expect((await f.ok('GET', '/command-center')).preferenceRevision).toBe(0)
  expect((await put(f.owner.cookie, 'https://foreign.example')).statusCode).toBe(403)
  expect((await f.send('GET', '/command-center', undefined, stranger.cookie)).statusCode).toBe(404)
  expect((await f.send('GET', '/command-center', undefined, '')).statusCode).toBe(401)
  expect((await f.send('GET', '/command-center?month=2026-99')).statusCode).toBe(400)
  expect((await f.ok('GET', '/command-center')).today).toBe(localBillDate())
}, 20000)
it('hides dismissed noncritical insights but keeps important risks accessible in Command Center', async () => {
  const f = await fixture()
  await f.ok('POST', '/expenses/initialize')
  const category = (await f.ok('GET', '/categories')).categories[0]
  const expense = {
    description: 'Fictional subscription',
    merchant: 'Fictional repeating subscription',
    amountCents: 1500,
    transactionDate: localBillDate(),
    responsibleMemberId: f.member,
    paymentMethod: 'debit_card',
    linkedDebtId: null,
    notes: null,
    allocations: [{ categoryId: category.id, amountCents: 1500 }],
  }
  for (const date of ['2026-08-21', '2026-09-21', '2026-10-21'])
    await f.ok('POST', '/expenses', {
      idempotencyKey: randomUUID(),
      expense: { ...expense, transactionDate: date },
    })
  let insights = await f.ok('GET', '/insights')
  const recurring = insights.report.insights.find((i: { type: string }) => i.type === 'recurring')
  expect(recurring).toBeTruthy()
  expect(
    (await f.ok('GET', '/command-center')).actions.some(
      (a: { id: string }) => a.id === 'insight:' + recurring.id,
    ),
  ).toBe(true)
  const dismiss = (id: string) =>
    f.ok('POST', '/insights/actions', {
      revision: 0,
      idempotencyKey: randomUUID(),
      fingerprint: insights.fingerprint,
      values: { kind: 'feedback', insightId: id, status: 'dismissed' },
    })
  await dismiss(recurring.id)
  expect(
    (await f.ok('GET', '/command-center')).actions.some(
      (a: { id: string }) => a.id === 'insight:' + recurring.id,
    ),
  ).toBe(false)
  for (let i = 0; i < 2; i++)
    await f.ok('POST', '/expenses', { idempotencyKey: randomUUID(), expense })
  insights = await f.ok('GET', '/insights')
  const duplicate = insights.report.insights.find(
    (i: { type: string }) => i.type === 'duplicate_review',
  )
  await dismiss(duplicate.id)
  const d = (await f.ok('GET', '/command-center')) as CommandCenter
  expect(d.insights.find((i) => i.id === duplicate.id)).toMatchObject({
    dismissed: true,
    priority: 'important',
  })
}, 15000)
