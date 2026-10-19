import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app'
import { testHome, testUser, testRequest, testOrigin } from './workspace'
const apps: FastifyInstance[] = [],
  folders: string[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
it('rejects future cleared transactions and balances, preserves planned records, and excludes legacy future completions', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'gox-dates-audit-'))
  folders.push(folder)
  const path = join(folder, 'audit.sqlite'),
    app = await buildApp({ databasePath: path, frontendOrigin: testOrigin, secureCookie: false })
  apps.push(app)
  const owner = await testUser(app, 'Owner'),
    { home, member } = await testHome(app, owner.cookie),
    base = `/api/households/${home}`
  const request = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    testRequest(app, method, base + url, owner.cookie, payload)
  const debtValues = {
    creditorName: 'Fictional date test',
    accountType: 'auto_loan',
    currentBalanceCents: 10000,
    memberAssignments: [{ memberId: member, responsibility: 'primary' }],
  }
  expect(
    (await request('POST', '/debts', { ...debtValues, balanceVerifiedAt: '2099-01-01T00:00:00Z' }))
      .statusCode,
  ).toBe(400)
  const debt = (await request('POST', '/debts', debtValues)).json().debt
  const debtPayment = {
    idempotencyKey: randomUUID(),
    amountCents: 1000,
    paymentDate: '2099-01-01',
    paymentMethod: 'cash',
    paymentStatus: 'completed',
  }
  expect((await request('POST', `/debts/${debt.id}/payments`, debtPayment)).statusCode).toBe(400)
  const planned = (
    await request('POST', `/debts/${debt.id}/payments`, {
      ...debtPayment,
      paymentStatus: 'scheduled',
    })
  ).json().payment
  expect(
    (await request('POST', `/debts/${debt.id}/payments/${planned.id}/confirm`, {})).statusCode,
  ).toBe(400)
  expect(
    (
      await request('POST', `/debts/${debt.id}/balances`, {
        idempotencyKey: randomUUID(),
        balanceCents: 0,
        effectiveDate: '2099-01-01',
        source: 'reconciliation',
        notes: null,
      })
    ).statusCode,
  ).toBe(400)
  const completed = (
    await request('POST', `/debts/${debt.id}/payments`, {
      ...debtPayment,
      idempotencyKey: randomUUID(),
      paymentDate: '2026-10-01',
    })
  ).json().payment
  expect(
    (
      await request('PATCH', `/debts/${debt.id}/payments/${completed.id}`, {
        paymentDate: '2099-01-01',
      })
    ).statusCode,
  ).toBe(400)
  const bill = (
    await request('POST', '/bills', {
      name: 'Fictional future bill',
      category: 'Other',
      kind: 'one_time',
      amountType: 'fixed',
      amountCents: 1000,
      estimatedAmountCents: null,
      frequency: null,
      nextDueDate: '2099-01-01',
      endDate: null,
      linkedDebtId: null,
      autoPay: false,
      status: 'active',
      notes: null,
      memberIds: [member],
    })
  ).json().bill
  const pathBill = `/bills/${bill.id}/periods/${bill.periods[0].id}/payments`,
    payment = {
      idempotencyKey: randomUUID(),
      amountCents: 1000,
      paymentDate: '2099-01-01',
      method: 'cash',
      status: 'completed',
      notes: null,
    }
  expect((await request('POST', pathBill, payment)).statusCode).toBe(400)
  const pending = (await request('POST', pathBill, { ...payment, status: 'pending' })).json().bill
    .payments[0]
  expect(
    (
      await request('POST', `/bills/${bill.id}/actions`, {
        action: 'confirm_payment',
        paymentId: pending.id,
      })
    ).statusCode,
  ).toBe(400)
  // An existing database may contain future completions accepted by the old version.
  const sql = new Database(path)
  try {
    sql.prepare("UPDATE debt_payments SET payment_status='completed' WHERE id=?").run(planned.id)
    sql
      .prepare(
        "UPDATE bill_payments SET status='completed',confirmed_at='2026-10-01T00:00:00.000Z' WHERE id=?",
      )
      .run(pending.id)
  } finally {
    sql.close()
  }
  const future = (await request('GET', '/overview?month=2099-01')).json()
  expect(future.actual.cashOutflowCents).toBe(0)
  expect(future.payments.completed.totalCents).toBe(0)
  expect(future.payments.futureCompletedCount).toBe(2)
  expect((await request('GET', `/bills/${bill.id}`)).json().bill.periods[0].remainingCents).toBe(
    1000,
  )
  expect(
    (await request('GET', `/debts/${debt.id}/payments`)).json().overview.completedPaymentTotalCents,
  ).toBe(1000)
  await request('POST', '/expenses/initialize', {})
  const category = (await request('GET', '/expenses')).json().categories[0].id
  expect(
    (
      await request('POST', '/expenses', {
        idempotencyKey: randomUUID(),
        expense: {
          description: 'Future actual expense',
          merchant: null,
          responsibleMemberId: member,
          amountCents: 1000,
          transactionDate: '2099-01-01',
          paymentMethod: 'cash',
          linkedDebtId: null,
          notes: null,
          allocations: [{ categoryId: category, amountCents: 1000 }],
        },
      })
    ).statusCode,
  ).toBe(400)
})
