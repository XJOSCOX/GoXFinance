import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { setup } from '../../../testing/financial-workspace'
import { testRequest, testUser } from '../../../testing/workspace'
import { openSqlite } from '../../../db/encryption/sqlite-engine'
import { providerFixture, fictionalToken, page, tx } from './plaid.fixture'
import { ProviderError } from './plaid.gateway'
type Fixture = Awaited<ReturnType<typeof setup>>
it('rejects a provider transaction moving accounts without advancing the cursor or losing history', async () => {
  const provider = providerFixture(),
    f = await setup(false, provider),
    id = await connect(f)
  const metadata = await provider.gateway.accounts('fictional')
  vi.mocked(provider.gateway.accounts).mockResolvedValue({
    ...metadata,
    accounts: [
      ...metadata.accounts,
      { ...metadata.accounts[0], id: 'savings', subtype: 'savings', name: 'Fictional savings' },
    ],
  })
  await sync(f, id)
  vi.mocked(provider.gateway.sync).mockResolvedValueOnce(
    page([], 'cursor-rejected', { modified: [tx('posted-1', { accountId: 'savings' })] }),
  )
  const p = await f.ok('POST', `/banking/plaid/${id}/preview`)
  expect(
    (await f.send('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })).statusCode,
  ).toBe(409)
  expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(1)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity, { readonly: true })
  try {
    expect(db.prepare('SELECT cursor FROM bank_connections WHERE id=?').get(id)).toEqual({
      cursor: 'cursor-1',
    })
  } finally {
    db.close()
  }
})
it('fails closed after restoring a database without its matching token key, while manual imports remain available', async () => {
  const provider = providerFixture(),
    f = await setup(false, provider)
  await connect(f)
  f.options.plaid = providerFixture()
  const next = await f.restart(),
    status = (
      await testRequest(next, 'GET', f.base + '/banking/plaid/status', f.owner.cookie)
    ).json()
  expect(status.enabled).toBe(false)
  expect(status.reason).toContain('original Windows-protected key')
  expect(
    (await testRequest(next, 'GET', f.base + '/banking/inbox', f.owner.cookie)).statusCode,
  ).toBe(200)
  const blocked = await testRequest(next, 'POST', f.base + '/banking/plaid/link', f.owner.cookie, {
    idempotencyKey: randomUUID(),
    connectionId: null,
  })
  expect(blocked.statusCode).toBe(503)
})
async function connect(f: Fixture) {
  const attempt = await f.ok('POST', '/banking/plaid/link', {
      idempotencyKey: randomUUID(),
      connectionId: null,
    }),
    body = { attemptId: attempt.attemptId, publicToken: 'public-sandbox-fictional' }
  const c = await f.ok('POST', '/banking/plaid/exchange', body)
  expect(await f.ok('POST', '/banking/plaid/exchange', body)).toMatchObject({
    connectionId: c.connectionId,
    replayed: true,
  })
  return c.connectionId as string
}
async function sync(f: Fixture, id: string) {
  const p = await f.ok('POST', `/banking/plaid/${id}/preview`)
  return f.ok('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })
}
it.each([false, true])(
  'encrypts Sandbox credentials, previews history, commits cursor atomically and survives restart; encrypted=%s',
  async (encrypted) => {
    const provider = providerFixture(),
      f = await setup(encrypted, provider),
      id = await connect(f)
    expect(provider.gateway.exchange).toHaveBeenCalledTimes(1)
    const p = await f.ok('POST', `/banking/plaid/${id}/preview`)
    expect(p).toMatchObject({ added: 1, accounts: 1 })
    expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(0)
    await f.ok('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })
    expect(
      (await f.send('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })).statusCode,
    ).toBe(409)
    await sync(f, id)
    const inbox = await f.ok('GET', '/banking/inbox')
    expect(inbox.transactions).toHaveLength(1)
    expect(inbox.transactions[0].amountCents).toBe(-4218)
    expect(JSON.stringify(inbox)).not.toMatch(
      /access-sandbox|cursor-|providerAccountId|providerItemId|tokenKeyId|tokenCiphertext/,
    )
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    try {
      const c = db.prepare('SELECT * FROM bank_connections WHERE id=?').get(id) as {
        token_ciphertext: string
        token_key_id: string
        cursor: string
      }
      expect(c.token_ciphertext).not.toContain(fictionalToken)
      expect(c.cursor).toBe('cursor-1')
      expect(provider.vault.open(c.token_ciphertext, c.token_key_id, f.home, id)).toBe(
        fictionalToken,
      )
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
    const next = await f.restart(),
      after = (await testRequest(next, 'GET', f.base + '/banking', f.owner.cookie)).json()
    expect(after.accounts[0]).toMatchObject({
      balance: { currentCents: 250000, availableCents: 200000 },
      connectionStatus: 'active',
    })
    expect(
      (await testRequest(next, 'GET', f.base + '/banking/inbox', f.owner.cookie)).json()
        .transactions,
    ).toHaveLength(1)
  },
)
it('restarts pagination from the original persisted cursor and resolves pending-to-posted across pages', async () => {
  const provider = providerFixture(),
    f = await setup(false, provider),
    id = await connect(f)
  vi.mocked(provider.gateway.sync).mockResolvedValueOnce(page([tx('pending', { pending: true })]))
  await sync(f, id)
  vi.mocked(provider.gateway.sync).mockClear()
  vi.mocked(provider.gateway.sync)
    .mockResolvedValueOnce(page([], 'intermediate', { more: true, removed: ['pending'] }))
    .mockRejectedValueOnce(new ProviderError('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'))
    .mockResolvedValueOnce(page([], 'intermediate', { more: true, removed: ['pending'] }))
    .mockResolvedValueOnce(
      page(
        [
          tx('final', {
            pendingId: 'pending',
            amount: 45.01,
            description: 'Final fictional purchase',
          }),
        ],
        'cursor-2',
      ),
    )
  await sync(f, id)
  expect(vi.mocked(provider.gateway.sync).mock.calls.map((c) => c[1])).toEqual([
    'cursor-1',
    'intermediate',
    'cursor-1',
    'intermediate',
  ])
  const rows = (await f.ok('GET', '/banking/inbox')).transactions
  expect(rows).toHaveLength(2)
  const pending = rows.find((t: { pending: boolean }) => t.pending),
    posted = rows.find((t: { pending: boolean }) => !t.pending)
  expect(pending).toMatchObject({
    reviewStatus: 'superseded',
    removed: true,
    replacedById: posted.id,
  })
  expect(posted).toMatchObject({ amountCents: -4501, reviewStatus: 'unreviewed' })
})
it('flags changed or withdrawn reconciled transactions without deleting financial links; rolls back failed commits', async () => {
  const provider = providerFixture(),
    f = await setup(false, provider),
    id = await connect(f)
  await sync(f, id)
  const original = (await f.ok('GET', '/banking/inbox')).transactions[0],
    db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    // Simulate a pre-existing reviewed transaction; the accounting integration itself is covered in Stage D.
    db.prepare("UPDATE bank_transactions SET review_status='reconciled' WHERE id=?").run(
      original.id,
    )
    vi.mocked(provider.gateway.sync).mockResolvedValueOnce(
      page([], 'cursor-2', { modified: [tx('posted-1', { amount: 55 })] }),
    )
    await sync(f, id)
    expect((await f.ok('GET', '/banking/inbox')).transactions[0]).toMatchObject({
      id: original.id,
      reviewStatus: 'needs_review',
      amountCents: -5500,
    })
    vi.mocked(provider.gateway.sync).mockResolvedValueOnce(
      page([], 'cursor-3', { removed: ['posted-1'] }),
    )
    await sync(f, id)
    expect((await f.ok('GET', '/banking/inbox')).transactions[0]).toMatchObject({
      id: original.id,
      removed: true,
      reviewStatus: 'needs_review',
      merchant: null,
      description: 'Provider removed transaction',
    })
    vi.mocked(provider.gateway.sync).mockResolvedValueOnce(page([tx('new')], 'cursor-4'))
    const p = await f.ok('POST', `/banking/plaid/${id}/preview`)
    db.exec(
      "CREATE TRIGGER reject_sync_audit BEFORE INSERT ON bank_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect(
      (await f.send('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })).statusCode,
    ).toBe(500)
    expect(db.prepare('SELECT cursor FROM bank_connections WHERE id=?').get(id)).toEqual({
      cursor: 'cursor-3',
    })
    expect((await f.ok('GET', '/banking/inbox')).transactions).toHaveLength(1)
  } finally {
    db.close()
  }
})
it('keeps lifetime reservations after failures and removal, and allows update mode without new capacity', async () => {
  const provider = providerFixture(1),
    f = await setup(false, provider),
    id = await connect(f)
  expect((await f.ok('GET', '/banking/plaid/status')).remainingItems).toBe(0)
  expect(
    (
      await f.send('POST', '/banking/plaid/link', {
        idempotencyKey: randomUUID(),
        connectionId: null,
      })
    ).statusCode,
  ).toBe(409)
  const update = await f.ok('POST', '/banking/plaid/link', {
    idempotencyKey: randomUUID(),
    connectionId: id,
  })
  expect(provider.gateway.link).toHaveBeenLastCalledWith(expect.any(String), fictionalToken)
  await f.ok('POST', '/banking/plaid/exchange', {
    attemptId: update.attemptId,
    publicToken: 'update-fictional',
  })
  expect(provider.gateway.exchange).toHaveBeenCalledTimes(1)
  await f.ok('POST', `/banking/plaid/${id}/disconnect`)
  expect(provider.gateway.remove).toHaveBeenCalledWith(fictionalToken)
  expect((await f.ok('GET', '/banking/plaid/status')).remainingItems).toBe(0)
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    expect(
      db
        .prepare('SELECT token_ciphertext,token_key_id,status FROM bank_connections WHERE id=?')
        .get(id),
    ).toEqual({ token_ciphertext: null, token_key_id: null, status: 'disconnected' })
  } finally {
    db.close()
  }
  const failing = providerFixture(1),
    g = await setup(false, failing)
  vi.mocked(failing.gateway.link).mockRejectedValueOnce(
    new Error('secret provider body must not leak'),
  )
  const failure = await g.send('POST', '/banking/plaid/link', {
    idempotencyKey: randomUUID(),
    connectionId: null,
  })
  expect(failure.statusCode).toBe(502)
  expect(failure.body).not.toContain('secret provider body')
  expect((await g.ok('GET', '/banking/plaid/status')).remainingItems).toBe(0)
})
it('enforces Owner-only operations, wrong household rejection, disabled sync and stale preview rejection', async () => {
  const provider = providerFixture(),
    f = await setup(false, provider),
    id = await connect(f),
    p = await f.ok('POST', `/banking/plaid/${id}/preview`)
  for (const role of ['admin', 'editor', 'viewer']) {
    const actor = await testUser(f.app, role)
    f.grant(actor.id, role)
    for (const [path, body] of [
      ['/link', { idempotencyKey: randomUUID(), connectionId: null }],
      [`/${id}/preview`, {}],
      [`/${id}/sync`, { previewId: p.previewId }],
      [`/${id}/disconnect`, {}],
      [`/${id}/disable`, { disabled: true }],
    ] as const)
      expect((await f.send('POST', '/banking/plaid' + path, body, actor.cookie)).statusCode).toBe(
        403,
      )
  }
  const outsider = await testUser(f.app, 'ForeignOwner')
  expect(
    (await f.send('POST', `/banking/plaid/${id}/preview`, {}, outsider.cookie)).statusCode,
  ).toBe(404)
  await f.ok('POST', `/banking/plaid/${id}/disable`, { disabled: true })
  expect(
    (await f.send('POST', `/banking/plaid/${id}/sync`, { previewId: p.previewId })).statusCode,
  ).toBe(409)
  expect((await f.send('POST', `/banking/plaid/${id}/preview`)).statusCode).toBe(409)
  await f.ok('POST', `/banking/plaid/${id}/disable`, { disabled: false })
  vi.mocked(provider.gateway.sync).mockRejectedValueOnce(new ProviderError('ITEM_LOGIN_REQUIRED'))
  const fail = await f.send('POST', `/banking/plaid/${id}/preview`)
  expect(fail.statusCode).toBe(502)
  expect(fail.body).toContain('ITEM_LOGIN_REQUIRED')
  expect((await f.ok('GET', '/banking')).connections[0].status).toBe('reauth_required')
})
