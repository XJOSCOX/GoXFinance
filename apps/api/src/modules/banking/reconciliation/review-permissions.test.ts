import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { bankAccountSchema } from '@goxfinance/shared'
import { reviewFixture } from './review.fixture'
import { testUser, testHome, testRequest } from '../../../testing/workspace'
import { edit } from '../../trading/trading.fixture'
it.each(['admin', 'editor'])(
  'keeps %s changes pending, supports rejection/cancellation and rejects stale approvals',
  async (role) => {
    const f = await reviewFixture(),
      actor = await testUser(f.app, 'Fictional' + role),
      member = f.grant(actor.id, role),
      profile = { ...bankAccountSchema.strip().parse(f.account), memberIds: [f.member, member] }
    await f.ok('PATCH', '/banking/accounts/' + f.account.id, edit(1, profile))
    const tx = await f.importRow('-42.18'),
      proposal = await f.expenseProposal(tx.id, 4218, member),
      first = await f.review(tx.id, proposal, actor.cookie)
    expect(first.result.status).toBe('pending')
    expect(
      (
        await f.send(
          'POST',
          `/banking/requests/${first.result.requestId}/decision`,
          { decision: 'approve' },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(403)
    await f.ok('POST', `/banking/requests/${first.result.requestId}/decision`, {
      decision: 'reject',
    })
    expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(0)
    const second = await f.review(tx.id, proposal, actor.cookie)
    await f.ok(
      'POST',
      `/banking/requests/${second.result.requestId}/decision`,
      { decision: 'cancel' },
      actor.cookie,
    )
    const third = await f.review(tx.id, proposal, actor.cookie)
    await f.ok(
      'PATCH',
      '/banking/accounts/' + f.account.id,
      edit(2, { ...profile, name: 'Fictional renamed account' }),
    )
    expect(
      (
        await f.send('POST', `/banking/requests/${third.result.requestId}/decision`, {
          decision: 'approve',
        })
      ).statusCode,
    ).toBe(409)
    expect((await f.ok('GET', '/expenses')).expenses).toHaveLength(0)
    const history = (await f.ok('GET', '/banking/inbox')).requests
    expect(history.find((r: { id: string }) => r.id === first.result.requestId).status).toBe(
      'rejected',
    )
    expect(history.find((r: { id: string }) => r.id === second.result.requestId).status).toBe(
      'cancelled',
    )
    expect(history.find((r: { id: string }) => r.id === third.result.requestId).status).toBe(
      'pending',
    )
  },
)
it('rejects a Viewer with explicit account access, Owner-only financial targets and cross-household target IDs', async () => {
  const f = await reviewFixture(),
    viewer = await testUser(f.app, 'FictionalViewer'),
    member = f.grant(viewer.id, 'viewer'),
    profile = { ...bankAccountSchema.strip().parse(f.account), memberIds: [f.member, member] }
  await f.ok('PATCH', '/banking/accounts/' + f.account.id, edit(1, profile))
  const tx = await f.importRow('-42.18'),
    proposal = await f.expenseProposal(tx.id)
  expect(
    (
      await f.send(
        'POST',
        `/banking/transactions/${tx.id}/preview`,
        { revision: 1, proposal },
        viewer.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await f.send('POST', `/banking/transactions/${tx.id}/preview`, {
        revision: 1,
        proposal: {
          classification: 'debt_payment',
          debtId: randomUUID(),
          paymentId: null,
          principalAmountCents: null,
          interestAmountCents: null,
          feesAmountCents: null,
        },
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await f.send('POST', `/banking/transactions/${tx.id}/preview`, {
        revision: 1,
        proposal: {
          classification: 'income',
          sourceId: randomUUID(),
          transactionId: null,
          confirmPending: true,
          actualGrossCents: null,
          deductionsCents: null,
        },
      })
    ).statusCode,
  ).toBe(400)
})
it('blocks accounting for pending authorizations and non-USD/unknown currency while allowing explicit exclusion', async () => {
  const f = await reviewFixture(),
    input = {
      accountId: f.account.id,
      format: 'csv',
      text: 'date,description,amount,pending\n2026-10-01,Fictional authorization,-42.18,true',
      dateFormat: 'iso',
      sign: 'inflow_positive',
      mapping: {
        date: 'date',
        description: 'description',
        amount: 'amount',
        debit: '',
        credit: '',
        merchant: '',
        pending: 'pending',
        currency: '',
        reference: '',
      },
    },
    p = await f.ok('POST', '/banking/imports/preview', input)
  await f.ok('POST', '/banking/imports/confirm', {
    input,
    previewHash: p.hash,
    selectedRows: [0],
    confirmPossibleDuplicates: false,
    idempotencyKey: randomUUID(),
  })
  const tx = (await f.ok('GET', '/banking/inbox')).transactions[0]
  expect(
    (
      await f.send('POST', `/banking/transactions/${tx.id}/preview`, {
        revision: 1,
        proposal: await f.expenseProposal(tx.id),
      })
    ).statusCode,
  ).toBe(409)
  await f.review(tx.id, {
    classification: 'ignore',
    reason: 'Fictional pending authorization excluded',
  })
  expect((await f.ok('GET', '/overview?month=2026-10')).actual.cashOutflowCents).toBe(0)
  for (const currency of ['EUR', null]) {
    const account = (
        await f.ok('POST', '/banking/accounts', {
          idempotencyKey: randomUUID(),
          values: {
            ...bankAccountSchema.strip().parse(f.account),
            name: 'Fictional ' + (currency ?? 'unknown'),
            currency,
          },
        })
      ).record,
      other = await f.importRow(
        '-42.18',
        'Fictional ' + (currency ?? 'unknown'),
        '2026-10-01',
        account.id,
      )
    expect(
      (
        await f.send('POST', `/banking/transactions/${other.id}/preview`, {
          revision: 1,
          proposal: await f.expenseProposal(other.id),
        })
      ).statusCode,
    ).toBe(400)
  }
})
it.each(['admin', 'editor'])(
  'protects Owner-only debts and atomically approves %s joint-debt payment requests',
  async (role) => {
    const f = await reviewFixture(),
      actor = await testUser(f.app, 'FictionalDebt' + role),
      member = f.grant(actor.id, role)
    await f.ok(
      'PATCH',
      '/banking/accounts/' + f.account.id,
      edit(1, { ...bankAccountSchema.strip().parse(f.account), memberIds: [f.member, member] }),
    )
    const exclusive = (
        await f.ok('POST', '/debts', {
          creditorName: 'Fictional Owner loan',
          accountType: 'personal_loan',
          currentBalanceCents: 100000,
          memberAssignments: [{ memberId: f.member, responsibility: 'primary' }],
        })
      ).debt,
      joint = (
        await f.ok('POST', '/debts', {
          creditorName: 'Fictional joint loan',
          accountType: 'personal_loan',
          currentBalanceCents: 100000,
          memberAssignments: [
            { memberId: f.member, responsibility: 'joint' },
            { memberId: member, responsibility: 'joint' },
          ],
        })
      ).debt,
      tx = await f.importRow('-100', 'Fictional joint loan payment'),
      proposal = {
        classification: 'debt_payment' as const,
        debtId: exclusive.id,
        paymentId: null,
        principalAmountCents: null,
        interestAmountCents: null,
        feesAmountCents: null,
      }
    expect(
      (
        await f.send(
          'POST',
          `/banking/transactions/${tx.id}/preview`,
          { revision: 1, proposal },
          actor.cookie,
        )
      ).statusCode,
    ).toBe(404)
    const { result } = await f.review(tx.id, { ...proposal, debtId: joint.id }, actor.cookie)
    const responses = await Promise.all([
      f.send('POST', `/banking/requests/${result.requestId}/decision`, { decision: 'approve' }),
      f.send('POST', `/banking/requests/${result.requestId}/decision`, { decision: 'approve' }),
    ])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect((await f.ok('GET', `/debts/${joint.id}/payments`)).payments).toHaveLength(1)
    expect((await f.ok('GET', '/overview?month=2026-10')).actual.cashOutflowCents).toBe(10000)
    const foreignUser = await testUser(f.app, 'OtherHouseholdOwner'),
      foreign = await testHome(f.app, foreignUser.cookie),
      other = (
        await testRequest(
          f.app,
          'POST',
          `/api/households/${foreign.home}/debts`,
          foreignUser.cookie,
          {
            creditorName: 'Other household debt',
            accountType: 'personal_loan',
            currentBalanceCents: 100000,
            memberAssignments: [{ memberId: foreign.member, responsibility: 'primary' }],
          },
        )
      ).json().debt,
      another = await f.importRow('-50', 'Fictional other-home test')
    expect(
      (
        await f.send('POST', `/banking/transactions/${another.id}/preview`, {
          revision: 1,
          proposal: { ...proposal, debtId: other.id },
        })
      ).statusCode,
    ).toBe(404)
  },
)
