import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { fixture, statement } from '../payroll/payroll.fixture'
import { testUser } from '../../testing/workspace'
import { createDebtSchema, incomeTransactionSchema, plannerInputSchema } from '@goxfinance/shared'
import { fictionalAdvance } from '../../../../../packages/shared/src/planner.fixture'
it('keeps Owner payroll-linked advances private and confirms deductions only after reviewed actual payroll', async () => {
  const f = await fixture(),
    user = await testUser(f.app, 'editor'),
    member = f.grant(user.id, 'editor'),
    debt = (
      await f.ok(
        'POST',
        '/debts',
        createDebtSchema.parse({
          creditorName: 'Fictional dedicated employer advance',
          accountType: 'personal_loan',
          currentBalanceCents: 10000,
          minimumPaymentCents: 12000,
          memberAssignments: [
            { memberId: f.member, responsibility: 'joint' },
            { memberId: member, responsibility: 'joint' },
          ],
        }),
      )
    ).debt
  const values = plannerInputSchema.parse({
    ...fictionalAdvance(debt.id),
    advanceType: 'employer',
    repaymentMethod: 'payroll_deduction',
    sourceId: f.source.id,
    payrollWeekId: f.w.id,
    receivedDate: '2026-10-10',
    repaymentDate: '2026-10-16',
    payrollRepaidCents: 12000,
  })
  async function body() {
    return {
      values,
      fingerprint: (await f.ok('GET', '/planner')).fingerprint,
      revision: 0,
      idempotencyKey: randomUUID(),
      reason: 'Fictional actual deduction review',
    }
  }
  expect((await f.send('POST', '/planner/records', await body())).statusCode).toBe(400)
  await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
    revision: f.w.revision,
    reason: 'Fictional paystub review',
    statement,
    documentDigest: 'a'.repeat(64),
  })
  const tx = (await f.ok('GET', '/income')).transactions[0]
  await f.ok('PATCH', '/income/transactions/' + tx.id, {
    revision: tx.revision,
    reason: 'Actual fictional deposit',
    values: incomeTransactionSchema
      .strip()
      .parse({ ...tx, status: 'confirmed', receiptConfirmed: true, depositDate: '2026-10-16' }),
  })
  const record = (await f.ok('POST', '/planner/records', await body())).record
  expect((await f.ok('GET', '/planner', undefined, user.cookie)).records).toEqual([])
  expect((await f.ok('GET', '/planner', undefined, user.cookie)).sources.payroll).toEqual([])
  expect(
    (
      await f.send(
        'PATCH',
        '/planner/records/' + record.id,
        { ...(await body()), revision: 1 },
        user.cookie,
      )
    ).statusCode,
  ).toBe(403)
  expect(
    (await f.send('GET', '/planner/records/' + record.id + '/audit', undefined, user.cookie))
      .statusCode,
  ).toBe(404)
  const updated = { ...(await body()), revision: 1, values: { ...values, status: 'completed' } }
  expect((await f.ok('PATCH', '/planner/records/' + record.id, updated)).record.values.status).toBe(
    'completed',
  )
})
