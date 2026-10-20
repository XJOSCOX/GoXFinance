import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { reviewFixture } from './review.fixture'
import { testRequest, testUser } from '../../../testing/workspace'
import { edit } from '../../trading/trading.fixture'
import { openSqlite } from '../../../db/encryption/sqlite-engine'
it.each([false, true])(
  'creates a split expense only after approval, prevents replay, and persists after restart; encrypted=%s',
  async (encrypted) => {
    const f = await reviewFixture(encrypted),
      tx = await f.importRow('-42.18'),
      proposal = await f.expenseProposal(tx.id)
    if (proposal.classification !== 'expense' || !proposal.expense) throw new Error('fixture')
    const options = await f.ok('GET', `/banking/transactions/${tx.id}/review`)
    proposal.expense.allocations = [
      { categoryId: options.categories[0].id, amountCents: 2000 },
      { categoryId: options.categories[1].id, amountCents: 2218 },
    ]
    expect((await f.ok('GET', '/overview?month=2026-10')).actual.cashOutflowCents).toBe(0)
    const { submission } = await f.review(tx.id, proposal)
    expect((await f.ok('GET', '/overview?month=2026-10')).actual).toMatchObject({
      cashOutflowCents: 4218,
      spendingCents: 4218,
    })
    expect(
      await f.ok('POST', `/banking/transactions/${tx.id}/reconcile`, submission),
    ).toMatchObject({ replayed: true, status: 'approved' })
    expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(1)
    const next = await f.restart()
    expect(
      (await testRequest(next, 'GET', f.base + '/overview?month=2026-10', f.owner.cookie)).json()
        .actual.cashOutflowCents,
    ).toBe(4218)
    expect(
      (await testRequest(next, 'GET', f.base + '/banking/inbox', f.owner.cookie)).json()
        .transactions[0].reviewStatus,
    ).toBe('reconciled')
  },
)
it('requires Owner approval for Admin/Editor, protects Owner-exclusive records and rejects Viewers and other households', async () => {
  const f = await reviewFixture(),
    admin = await testUser(f.app, 'ReviewAdmin'),
    member = f.grant(admin.id, 'admin')
  await f.ok(
    'PATCH',
    '/banking/accounts/' + f.account.id,
    edit(1, {
      memberIds: [f.member, member],
      name: f.account.name,
      institution: f.account.institution,
      type: f.account.type,
      subtype: null,
      mask: '1234',
      currency: 'USD',
      status: 'active',
      assetId: null,
      debtId: null,
    }),
  )
  const tx = await f.importRow('-42.18'),
    proposal = await f.expenseProposal(tx.id, 4218, member)
  const { result } = await f.review(tx.id, proposal, admin.cookie)
  expect(result.status).toBe('pending')
  expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(0)
  expect(
    (
      await f.send(
        'POST',
        `/banking/requests/${result.requestId}/decision`,
        { decision: 'approve' },
        admin.cookie,
      )
    ).statusCode,
  ).toBe(403)
  await f.ok('POST', `/banking/requests/${result.requestId}/decision`, { decision: 'approve' })
  expect(
    (
      await f.send('POST', `/banking/requests/${result.requestId}/decision`, {
        decision: 'approve',
      })
    ).statusCode,
  ).toBe(409)
  expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(1)
  const other = await f.importRow('-5', 'Fictional other'),
    protectedProposal = await f.expenseProposal(other.id, 500, f.member)
  expect(
    (
      await f.send(
        'POST',
        `/banking/transactions/${other.id}/preview`,
        { revision: 1, proposal: protectedProposal },
        admin.cookie,
      )
    ).statusCode,
  ).toBe(403)
  const viewer = await testUser(f.app, 'ReviewViewer')
  f.grant(viewer.id, 'viewer')
  expect(
    (
      await f.send(
        'POST',
        `/banking/transactions/${other.id}/preview`,
        { revision: 1, proposal: protectedProposal },
        viewer.cookie,
      )
    ).statusCode,
  ).toBe(404)
  const outsider = await testUser(f.app, 'ReviewOutside')
  expect(
    (await f.send('GET', `/banking/transactions/${tx.id}/review`, undefined, outsider.cookie))
      .statusCode,
  ).toBe(404)
})
it('rejects stale target changes and rolls back linked financial entries if the final audit fails', async () => {
  const f = await reviewFixture(),
    tx = await f.importRow('-42.18'),
    proposal = await f.expenseProposal(tx.id),
    preview = await f.ok('POST', `/banking/transactions/${tx.id}/preview`, {
      revision: 1,
      proposal,
    })
  const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
  try {
    db.exec(
      "CREATE TRIGGER reject_review_audit BEFORE INSERT ON bank_audit BEGIN SELECT RAISE(ABORT,'fictional rollback');END;",
    )
    expect(
      (
        await f.send('POST', `/banking/transactions/${tx.id}/reconcile`, {
          revision: 1,
          proposal,
          fingerprint: preview.fingerprint,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(500)
    expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(0)
    expect(db.prepare('SELECT COUNT(*) n FROM bank_reconciliations').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
