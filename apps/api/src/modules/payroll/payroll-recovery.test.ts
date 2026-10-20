import { expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fixture, statement } from './payroll.fixture'
import { testRequest } from '../../testing/workspace'
import { verifySnapshot, restoreQueuedSnapshot } from '../../db/sqlite-backups'
import { openSqlite } from '../../db/encryption/sqlite-engine'
it.each([false, true])(
  'restores normalized payroll, immutable forecasts and Income links with the existing backup workflow; encrypted=%s',
  async (encrypted) => {
    const f = await fixture(encrypted),
      reviewed = await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
        revision: 1,
        reason: 'Synthetic verified paystub',
        statement,
        documentDigest: null,
      }),
      backup = await testRequest(f.app, 'POST', '/api/backups', f.owner.cookie, {})
    expect(backup.statusCode).toBe(201)
    const id = backup.json().backup.id
    verifySnapshot(
      join(dirname(f.options.databasePath), 'backups', `${id}.sqlite`),
      f.options.databaseSecurity,
    )
    expect(
      (
        await testRequest(f.app, 'POST', `/api/backups/${id}/restore`, f.owner.cookie, {
          confirmation: 'RESTORE DATABASE',
        })
      ).statusCode,
    ).toBe(202)
    await f.app.close()
    expect(await restoreQueuedSnapshot(f.options.databasePath, f.options.databaseSecurity)).toBe(
      true,
    )
    const next = await f.restart(),
      login = await testRequest(next, 'POST', '/api/auth/login', undefined, {
        email: 'owner@example.com',
        password: 'long test password',
      }),
      cookie = String(login.headers['set-cookie']).split(';')[0]
    expect(login.statusCode).toBe(200)
    const restored = (await testRequest(next, 'GET', f.base + '/income/payroll', cookie)).json()
      .weeks[0]
    expect(restored.incomeTransactionId).toBe(reviewed.incomeTransactionId)
    expect(restored.statement.lines).toEqual(reviewed.statement.lines)
    expect(restored.forecasts).toEqual(f.w.forecasts)
  },
)
it('rolls back Income, statement lines and lifecycle changes when payroll audit fails', async () => {
  const f = await fixture(),
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_payroll_review BEFORE INSERT ON payroll_audit BEGIN SELECT RAISE(ABORT,'fictional failure'); END;",
    )
    expect(
      (
        await f.send('POST', `/income/payroll/weeks/${f.w.id}/review`, {
          revision: 1,
          reason: 'Synthetic rollback',
          statement,
          documentDigest: null,
        })
      ).statusCode,
    ).toBe(500)
    expect((await f.ok('GET', '/income')).transactions).toHaveLength(0)
    expect((await f.ok('GET', '/income/payroll')).weeks[0]).toMatchObject({
      revision: 1,
      stage: 'hours_submitted',
      statement: null,
      incomeTransactionId: null,
    })
    expect(db.prepare('SELECT COUNT(*) n FROM payroll_statements').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM payroll_lines').get()).toEqual({ n: 0 })
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally {
    db.close()
  }
})
