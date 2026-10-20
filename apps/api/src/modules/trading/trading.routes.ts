import type { PayoutBatchService } from './payout-batch.service'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../auth/auth.service'
import type { TradingService } from './trading.service'
import type { PayoutService } from './payout.service'
import type { CopyService } from './copy.service'
const params = z.object({ householdId: z.uuid(), id: z.uuid().optional() })
export function registerTradingRoutes(
  app: FastifyInstance,
  auth: AuthService,
  trading: TradingService,
  payouts: PayoutService,
  copy: CopyService,
  batches: PayoutBatchService,
) {
  const user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName]),
    base = '/api/households/:householdId/trading'
  app.get(base, (r) => {
    const p = params.parse(r.params),
      u = user(r)
    const accounts = trading.accounts(u, p.householdId)
    return {
      accounts,
      results: trading.results(u, p.householdId),
      payouts: payouts.list(u, p.householdId),
      ...copy.list(u, p.householdId),
      canCreate: trading.canCreate(u, p.householdId),
    }
  })
  app.get(base + '/audit/:id', (r) => {
    const p = params.parse(r.params)
    return { audit: trading.history(user(r), p.householdId, p.id!) }
  })
  app.post(base + '/accounts', (r, reply) =>
    reply
      .code(201)
      .send({ record: trading.saveAccount(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/accounts/:id', (r) => {
    const p = params.parse(r.params)
    return { record: trading.saveAccount(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/accounts/:id/promote', (r, reply) => {
    const p = params.parse(r.params)
    return reply
      .code(201)
      .send({ promotion: trading.promoteCombine(user(r), p.householdId, p.id!, r.body) })
  })
  app.delete(base + '/accounts/:id', (r) => {
    const p = params.parse(r.params)
    return { record: trading.setAccountDeleted(user(r), p.householdId, p.id!, r.body, true) }
  })
  app.post(base + '/accounts/:id/restore', (r) => {
    const p = params.parse(r.params)
    return { record: trading.setAccountDeleted(user(r), p.householdId, p.id!, r.body, false) }
  })
  app.post(base + '/accounts/batch', (r, reply) =>
    reply
      .code(201)
      .send({ records: trading.saveAccounts(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.post(base + '/accounts/rules', (r) => ({
    records: trading.saveAccountRules(user(r), params.parse(r.params).householdId, r.body),
  }))
  app.patch(base + '/accounts/:id/rules/:ruleId', (r) => {
    const p = z.object({ householdId: z.uuid(), id: z.uuid(), ruleId: z.uuid() }).parse(r.params)
    return { record: trading.correctRule(user(r), p.householdId, p.id, p.ruleId, r.body) }
  })
  app.post(base + '/results', (r, reply) =>
    reply
      .code(201)
      .send({ record: trading.saveResult(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/results/:id', (r) => {
    const p = params.parse(r.params)
    return { record: trading.saveResult(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/results/batch', (r, reply) =>
    reply
      .code(201)
      .send({ records: trading.saveResults(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.delete(base + '/results/:id', (r) => {
    const p = params.parse(r.params)
    return { record: trading.deleteResult(user(r), p.householdId, p.id!, r.body) }
  })
  app.post(base + '/payouts', (r, reply) =>
    reply
      .code(201)
      .send({ record: payouts.save(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/payouts/:id', (r) => {
    const p = params.parse(r.params)
    return { record: payouts.save(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/groups', (r, reply) =>
    reply
      .code(201)
      .send({ record: copy.saveGroup(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/groups/:id', (r) => {
    const p = params.parse(r.params)
    return { record: copy.saveGroup(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/events', (r, reply) =>
    reply
      .code(201)
      .send({ record: copy.saveEvent(user(r), params.parse(r.params).householdId, r.body) }),
  )
  app.patch(base + '/events/:id', (r) => {
    const p = params.parse(r.params)
    return { record: copy.saveEvent(user(r), p.householdId, r.body, p.id) }
  })
  app.post(base + '/batches', (r, reply) =>
    reply
      .code(201)
      .send({ record: batches.createBatch(user(r), params.parse(r.params).householdId, r.body) }),
  )
}
