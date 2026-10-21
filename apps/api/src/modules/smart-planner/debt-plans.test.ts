import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  plannerInputSchema,
  smartForecastInput,
  smartPlanner,
  localBillDate,
} from '@goxfinance/shared'
import { setup } from '../../testing/financial-workspace'
import { testRequest, testUser } from '../../testing/workspace'
const values = (id: string, patch: object = {}) =>
  plannerInputSchema.parse({
    kind: 'debt_plan',
    name: 'Fictional collection payment goal',
    target: { kind: 'debt', id },
    mode: 'pay_by_date',
    amountCents: 800000,
    startDate: '2026-10-21',
    deadline: '2026-11-15',
    amountBasis: 'custom',
    verification: { verified: false },
    status: 'draft',
    ...patch,
  })
async function body(
  f: Awaited<ReturnType<typeof setup>>,
  v: unknown,
  cookie?: string,
  revision = 0,
) {
  const data = await f.ok('GET', '/planner', undefined, cookie)
  return {
    values: v,
    revision,
    fingerprint: data.fingerprint,
    reason: 'Fictional reviewed debt payment terms',
    idempotencyKey: randomUUID(),
  }
}
async function debt(f: Awaited<ReturnType<typeof setup>>, members = [f.member]) {
  return (
    await f.ok('POST', '/debts', {
      creditorName: 'Fictional collection',
      accountType: 'collection',
      currentBalanceCents: 1463500,
      pastDueAmountCents: 1463500,
      memberAssignments: members.map((memberId) => ({ memberId, responsibility: 'joint' })),
    })
  ).debt
}
it.each([false, true])(
  'persists reviewed payoff goals without changing debt balances or creating transactions; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      d = await debt(f),
      v = values(d.id),
      create = await body(f, v),
      record = (await f.ok('POST', '/planner/records', create)).record
    expect((await f.ok('POST', '/planner/records', create)).record.id).toBe(record.id)
    let data = await f.ok('GET', '/planner')
    expect(
      smartPlanner(
        data.sources,
        smartForecastInput(data.settings, localBillDate(), 30),
        localBillDate(),
      ).items,
    ).toHaveLength(0)
    await f.ok(
      'PATCH',
      '/planner/records/' + record.id,
      await body(f, values(d.id, { status: 'confirmed' }), undefined, 1),
    )
    expect(
      (
        await f.send(
          'POST',
          '/planner/records',
          await body(f, values(d.id, { status: 'confirmed' })),
        )
      ).statusCode,
    ).toBe(400)
    data = await f.ok('GET', '/planner')
    expect(data.sources.debts[0].currentBalanceCents).toBe(1463500)
    expect(data.sources.payments).toEqual([])
    expect(data.sources.expenses).toEqual([])
    expect(data.sources.income.transactions).toEqual([])
    const next = await f.restart(),
      after = (await testRequest(next, 'GET', f.base + '/planner', f.owner.cookie)).json()
    expect(after.records.find((r: { id: string }) => r.id === record.id).values.status).toBe(
      'confirmed',
    )
  },
)
it.each(['admin', 'editor'])(
  'requires Owner review for %s joint debt goals and rejects Owner-exclusive or Viewer changes',
  async (role) => {
    const f = await setup(false),
      u = await testUser(f.app, role),
      member = f.grant(u.id, role),
      d = await debt(f, [f.member, member]),
      exclusive = await debt(f),
      viewer = await testUser(f.app, 'viewer')
    f.grant(viewer.id, 'viewer')
    const request = (
      await f.ok(
        'POST',
        '/planner/records',
        await body(f, values(d.id, { status: 'confirmed' }), u.cookie),
        u.cookie,
      )
    ).request
    expect(request.status).toBe('pending')
    expect((await f.ok('GET', '/planner')).records).toEqual([])
    const review = {
      decision: 'approved',
      reason: 'Fictional Owner review',
      idempotencyKey: randomUUID(),
    }
    expect(
      (await f.send('POST', '/planner/requests/' + request.id + '/review', review, u.cookie))
        .statusCode,
    ).toBe(403)
    await f.ok('POST', '/planner/requests/' + request.id + '/review', review)
    expect(
      (
        await f.send(
          'POST',
          '/planner/records',
          await body(f, values(exclusive.id), u.cookie),
          u.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await f.send(
          'POST',
          '/planner/records',
          await body(f, values(d.id), viewer.cookie),
          viewer.cookie,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await f.send('POST', '/planner/records', await body(f, values(randomUUID())))).statusCode,
    ).toBe(403)
  },
)
it('validates settlement identity, accepted terms, exact amount, revision and deadline before substitution', async () => {
  const f = await setup(false),
    d = await debt(f),
    offerValues = {
      debtId: d.id,
      creditor: 'Fictional creditor',
      originalBalanceCents: 1463500,
      amountCents: 800000,
      offerDate: '2026-10-21',
      expirationDate: null,
      kind: 'lump_sum',
      status: 'offered',
      writtenConfirmed: false,
      notes: null,
      document: null,
      schedule: [{ id: randomUUID(), dueDate: '2026-11-15', amountCents: 800000, paymentId: null }],
    },
    offer = (
      await f.ok('POST', '/debt-planning/offers', {
        values: offerValues,
        idempotencyKey: randomUUID(),
      })
    ).record
  const planned = values(d.id, {
    status: 'confirmed',
    amountBasis: 'settlement',
    settlementId: offer.id,
    settlementRevision: offer.revision,
    replaceOriginal: true,
    verification: {
      verified: true,
      source: 'Fictional written agreement',
      verifiedAt: '2026-10-21T00:00:00Z',
    },
  })
  expect((await f.send('POST', '/planner/records', await body(f, planned))).statusCode).toBe(400)
  await f.ok('PATCH', '/debt-planning/offers/' + offer.id, {
    values: { ...offerValues, status: 'accepted', writtenConfirmed: true },
    revision: 1,
    reason: 'Fictional written acceptance',
  })
  const accepted = { ...planned, settlementRevision: 2 }
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await body(f, {
          ...accepted,
          verification: {
            verified: true,
            source: 'Fictional written agreement',
            verifiedAt: '2099-01-01T00:00:00Z',
          },
        }),
      )
    ).statusCode,
  ).toBe(400)
  expect(
    (await f.send('POST', '/planner/records', await body(f, { ...accepted, amountCents: 700000 })))
      .statusCode,
  ).toBe(400)
  expect(
    (
      await f.send(
        'POST',
        '/planner/records',
        await body(f, { ...accepted, deadline: '2026-11-16' }),
      )
    ).statusCode,
  ).toBe(400)
  await f.ok('POST', '/planner/records', await body(f, accepted))
  const data = await f.ok('GET', '/planner'),
    r = smartPlanner(
      data.sources,
      smartForecastInput(data.settings, localBillDate(), 30),
      localBillDate(),
    )
  expect(r.items.reduce((n, i) => n + (i.amountCents ?? 0), 0)).toBe(800000)
  expect(data.sources.debts[0].currentBalanceCents).toBe(1463500)
})
