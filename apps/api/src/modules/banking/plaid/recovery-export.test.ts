import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { setup } from '../../../testing/financial-workspace'
import { testRequest } from '../../../testing/workspace'
import { openSqlite } from '../../../db/encryption/sqlite-engine'
import { verifySnapshot, restoreQueuedSnapshot } from '../../../db/sqlite-backups'
import { providerFixture, fictionalToken } from './plaid.fixture'
const filters = {
  from: '2026-10-01',
  to: '2026-10-31',
  memberId: null,
  categoryId: null,
  debtId: null,
  accountId: null,
  groupId: null,
}
it.each([false, true])(
  'keeps bank report exports secret-free and restores encrypted token/link/cursor history; encrypted=%s',
  async (encrypted) => {
    const provider = providerFixture(),
      f = await setup(encrypted, provider)
    const attempt = await f.ok('POST', '/banking/plaid/link', {
      idempotencyKey: randomUUID(),
      connectionId: null,
    })
    const { connectionId } = await f.ok('POST', '/banking/plaid/exchange', {
      attemptId: attempt.attemptId,
      publicToken: 'public-sandbox-fictional',
    })
    const preview = await f.ok('POST', `/banking/plaid/${connectionId}/preview`)
    await f.ok('POST', `/banking/plaid/${connectionId}/sync`, { previewId: preview.previewId })
    const reportFilters = { ...filters, kind: 'banking' }
    const report = await f.ok('POST', '/reports/preview', reportFilters)
    expect(
      report.tables.find((t: { name: string }) => t.name === 'Bank balance observations').rows[0],
    ).toMatchObject({ currentBalanceCents: 250000, availableBalanceCents: 200000 })
    expect(JSON.stringify(report)).not.toMatch(
      /access-sandbox|public-sandbox|tokenCiphertext|tokenKeyId|providerAccountId|providerItemId|cursor-/,
    )
    for (const format of ['json', 'csv', 'xlsx', 'pdf']) {
      const res = await f.send('POST', '/reports/export', { filters: reportFilters, format })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toContain('no-store')
      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(res.rawPayload as unknown as ExcelJS.Buffer)
        expect(workbook.worksheets.length).toBe(3)
        expect(JSON.stringify(workbook.model)).not.toContain(fictionalToken)
      } else if (format === 'pdf') expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
      else
        expect(res.body).not.toMatch(
          /access-sandbox|tokenCiphertext|tokenKeyId|providerAccountId|providerItemId|cursor-/,
        )
    }
    const backup = await testRequest(f.app, 'POST', '/api/backups', f.owner.cookie, {})
    expect(backup.statusCode).toBe(201)
    const backupId = backup.json().backup.id
    verifySnapshot(
      join(dirname(f.options.databasePath), 'backups', `${backupId}.sqlite`),
      f.options.databaseSecurity,
    )
    await f.ok('POST', `/banking/plaid/${connectionId}/disable`, { disabled: true })
    const queued = await testRequest(
      f.app,
      'POST',
      `/api/backups/${backupId}/restore`,
      f.owner.cookie,
      { confirmation: 'RESTORE DATABASE' },
    )
    expect(queued.statusCode).toBe(202)
    await f.app.close()
    expect(await restoreQueuedSnapshot(f.options.databasePath, f.options.databaseSecurity)).toBe(
      true,
    )
    const next = await f.restart()
    expect((await testRequest(next, 'GET', '/api/auth/me', f.owner.cookie)).statusCode).toBe(401)
    const login = await testRequest(next, 'POST', '/api/auth/login', undefined, {
      email: 'owner@example.com',
      password: 'long test password',
    })
    expect(login.statusCode).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]
    const inbox = await testRequest(next, 'GET', f.base + '/banking/inbox', cookie)
    expect(inbox.statusCode).toBe(200)
    expect(inbox.json().transactions).toHaveLength(1)
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity, { readonly: true })
    try {
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      const record = db
        .prepare(
          'SELECT token_ciphertext,token_key_id,cursor,status FROM bank_connections WHERE id=?',
        )
        .get(connectionId) as {
        token_ciphertext: string
        token_key_id: string
        cursor: string
        status: string
      }
      expect(
        provider.vault.open(record.token_ciphertext, record.token_key_id, f.home, connectionId),
      ).toBe(fictionalToken)
      expect(record).toMatchObject({ cursor: 'cursor-1', status: 'active' })
    } finally {
      db.close()
    }
  },
)
