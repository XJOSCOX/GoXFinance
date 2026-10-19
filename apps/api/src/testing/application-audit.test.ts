import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { initializeEncryptedDatabase } from '../db/encryption/initialize-database'
import { prepareEncryptedConversion } from '../db/encryption/convert-database'
import { openSqlite, plaintext, type DatabaseSecurity } from '../db/encryption/sqlite-engine'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app'
import { restoreQueuedSnapshot, verifySnapshot } from '../db/sqlite-backups'
import { testHome, testOrigin, testRequest, testUser } from './workspace'

const folders: string[] = [],
  apps: FastifyInstance[] = []
const keys: Buffer[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  for (const key of keys.splice(0)) key.fill(0)
})
it.each(['plaintext', 'encrypted', 'converted'])(
  'reconciles every financial module, approvals, backup and restore in %s mode',
  async (mode) => {
    const folder = mkdtempSync(join(tmpdir(), 'gox-full-audit-'))
    folders.push(folder)
    let path = join(folder, 'audit.sqlite')
    const key = randomBytes(32)
    keys.push(key)
    const encrypted: DatabaseSecurity = { mode: 'encrypted', key }
    const options = {
      databasePath: path,
      frontendOrigin: testOrigin,
      secureCookie: false,
      databaseSecurity: mode === 'encrypted' ? encrypted : plaintext,
    }
    if (mode === 'encrypted') initializeEncryptedDatabase(path, encrypted)
    let app = await buildApp(options)
    apps.push(app)
    const owner = await testUser(app, 'Owner'),
      { home, member } = await testHome(app, owner.cookie),
      base = `/api/households/${home}`
    const send = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: object,
      cookie = owner.cookie,
    ) => testRequest(app, method, url, cookie, payload)
    const ok = async (
      method: 'GET' | 'POST' | 'PATCH',
      url: string,
      payload?: object,
      cookie = owner.cookie,
    ) => {
      const response = await send(method, url, payload, cookie)
      expect(response.statusCode, response.body).toBeLessThan(300)
      return response.json()
    }
    // Real invitation redemption and role assignment, using only fictional test accounts.
    const guest = (
      await ok('POST', base + '/members', {
        fullName: 'Fictional Admin',
        relationship: 'other',
        plannedAccessRole: 'admin',
      })
    ).member
    const invitation = await ok('POST', `${base}/members/${guest.id}/invitations`, {
      role: 'admin',
    })
    const admin = await testUser(app, 'Admin')
    await ok('POST', '/api/household-invitations/redeem', { code: invitation.code }, admin.cookie)
    expect(
      (await send('DELETE', `${base}/members/${member}`, undefined, admin.cookie)).statusCode,
    ).toBe(403)
    const proposal = (
      await ok(
        'POST',
        base + '/member-requests',
        { fullName: 'Fictional Child', relationship: 'child', notes: 'QA proposal' },
        admin.cookie,
      )
    ).request
    expect(
      (await send('POST', `${base}/members/${proposal.id}/invitations`, { role: 'viewer' }))
        .statusCode,
    ).toBe(404)
    expect(
      (
        await send(
          'POST',
          `${base}/member-requests/${proposal.id}/approve`,
          { role: 'viewer' },
          admin.cookie,
        )
      ).statusCode,
    ).toBe(403)
    await ok('POST', `${base}/member-requests/${proposal.id}/approve`, { role: 'viewer' })
    expect(
      (await send('POST', `${base}/member-requests/${proposal.id}/approve`, { role: 'viewer' }))
        .statusCode,
    ).toBe(409)
    const debt = (
      await ok('POST', base + '/debts', {
        creditorName: 'Fictional joint loan',
        accountType: 'auto_loan',
        currentBalanceCents: 100000,
        minimumPaymentCents: 10000,
        balanceVerifiedAt: '2026-10-01T00:00:00Z',
        memberAssignments: [member, guest.id].map((memberId) => ({
          memberId,
          responsibility: 'joint',
        })),
      })
    ).debt
    expect(
      (
        await send(
          'PATCH',
          `${base}/debts/${debt.id}`,
          { creditorName: 'Unauthorized' },
          admin.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const request = await ok(
      'POST',
      `${base}/debts/${debt.id}/change-requests`,
      {
        action: 'edit_account',
        changes: { accountNickname: 'Approved QA nickname' },
        reason: 'Owner review',
        idempotencyKey: randomUUID(),
      },
      admin.cookie,
    )
    await ok('POST', `${base}/debt-change-requests/${request.requestId}/approve`, {
      confirmed: true,
    })
    const billValues = {
      name: 'Fictional obligation',
      category: 'Other',
      kind: 'recurring',
      amountType: 'fixed',
      amountCents: 15000,
      estimatedAmountCents: null,
      frequency: 'monthly',
      nextDueDate: '2026-10-01',
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: debt.id,
      memberIds: [member, guest.id],
    }
    let linked = (await ok('POST', base + '/bills', billValues)).bill
    const record = await ok(
      'POST',
      `${base}/bills/${linked.id}/periods/${linked.periods[0].id}/payments`,
      {
        idempotencyKey: randomUUID(),
        amountCents: 15000,
        paymentDate: '2026-10-10',
        method: 'cash',
        notes: null,
        principalAmountCents: 10000,
        interestAmountCents: 5000,
      },
      admin.cookie,
    )
    const paymentId = record.bill.payments[0].id
    expect(
      (
        await send(
          'POST',
          `${base}/bills/${linked.id}/actions`,
          { action: 'confirm_payment', paymentId },
          admin.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const approval = await ok(
      'POST',
      `${base}/bills/${linked.id}/requests`,
      {
        idempotencyKey: randomUUID(),
        reason: 'Cleared joint payment',
        proposal: { action: 'confirm_payment', paymentId },
      },
      admin.cookie,
    )
    await ok('POST', `${base}/bills/requests/${approval.id}/review`, { action: 'approve' })
    linked = (await ok('GET', `${base}/bills/${linked.id}`)).bill
    expect(linked.periods[0].paidCents).toBe(15000)
    const authoritative = await ok('GET', `${base}/debts/${debt.id}/payments`)
    expect(authoritative.payments).toHaveLength(1)
    expect(authoritative.overview.estimatedOutstandingCents).toBe(90000)
    const utility = (
      await ok('POST', base + '/bills', {
        ...billValues,
        name: 'Fictional utility',
        amountType: 'variable',
        amountCents: null,
        estimatedAmountCents: 30000,
        linkedDebtId: null,
        memberIds: [member],
      })
    ).bill
    await ok('POST', `${base}/bills/${utility.id}/actions`, {
      action: 'edit_period',
      periodId: utility.periods[0].id,
      changes: { amountCents: 34218, creditCents: 0, notes: null },
    })
    await ok('POST', `${base}/bills/${utility.id}/periods/${utility.periods[0].id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: 20000,
      paymentDate: '2026-10-10',
      method: 'cash',
      status: 'completed',
      notes: null,
    })
    const once = (
      await ok('POST', base + '/bills', {
        ...billValues,
        name: 'Fictional one-time bill',
        kind: 'one_time',
        amountCents: 10000,
        frequency: null,
        linkedDebtId: null,
        memberIds: [member],
      })
    ).bill
    await ok('POST', `${base}/bills/${once.id}/periods/${once.periods[0].id}/payments`, {
      idempotencyKey: randomUUID(),
      amountCents: 10000,
      paymentDate: '2026-10-20',
      method: 'cash',
      status: 'pending',
      notes: null,
    })
    await ok('POST', base + '/expenses/initialize', {})
    const category = (await ok('GET', base + '/expenses')).categories[0].id
    for (const [amount, paymentMethod] of [
      [2500, 'cash'],
      [6000, 'credit_card'],
    ] as const)
      await ok('POST', base + '/expenses', {
        idempotencyKey: randomUUID(),
        expense: {
          responsibleMemberId: member,
          description: 'Fictional purchase',
          merchant: null,
          amountCents: amount,
          transactionDate: '2026-10-10',
          paymentMethod,
          linkedDebtId: null,
          notes: null,
          allocations: [{ categoryId: category, amountCents: amount }],
        },
      })
    const source = (
      await ok('POST', base + '/income/sources', {
        idempotencyKey: randomUUID(),
        values: {
          responsibleMemberId: member,
          name: 'Fictional job',
          incomeType: 'hourly',
          frequency: 'weekly',
          hourlyRateCents: 2500,
          expectedGrossCents: null,
          expectedNetCents: 70000,
          payday: 4,
          overtimeMultiplier: '1.25',
          status: 'active',
          notes: null,
        },
      })
    ).source
    const paycheck = {
      sourceId: source.id,
      workPeriodStart: '2026-10-01',
      workPeriodEnd: '2026-10-07',
      regularHours: '29',
      overtimeHours: '1.5',
      hourlyRateCents: 2500,
      overtimeMultiplier: '1.25',
      expectedGrossCents: null,
      expectedNetCents: 70000,
      actualGrossCents: 77188,
      deductionsCents: 9188,
      actualNetCents: 68000,
      payDate: '2026-10-08',
      depositDate: '2026-10-09',
      status: 'confirmed',
      reference: null,
      notes: null,
      receiptConfirmed: true,
      tradingPayoutWithdrawn: false,
    }
    const incomeKey = randomUUID()
    await ok('POST', base + '/income/transactions', { idempotencyKey: incomeKey, values: paycheck })
    await ok('POST', base + '/income/transactions', { idempotencyKey: incomeKey, values: paycheck })
    const check = async () => {
      const result = await ok('GET', base + '/overview?month=2026-10')
      expect(result.actual).toEqual({
        spendingCents: 28500,
        cashOutflowCents: 37500,
        transactionCount: 4,
      })
      expect(result.income).toEqual({ confirmedCents: 68000, netRecordedCashFlowCents: 30500 })
      expect(result.bills.householdMonthlyObligationsCents).toBe(45000)
      expect(result.payments.remainingBills.amountCents).toBe(24218)
      expect(result.payments.completed.items).toHaveLength(2)
      expect(result.payments.pending.totalCents).toBe(10000)
      // Even a confirmed payment with known principal is not a new balance snapshot.
      expect(result.debtProgress).toMatchObject({ trackedCount: 0, missingHistoryCount: 1, reductionCents: 0 })
      expect((await ok('GET', base + '/income')).transactions).toHaveLength(1)
    }
    if (mode === 'converted') {
      await app.close()
      apps.splice(apps.indexOf(app), 1)
      const destination = join(folder, 'converted.sqlite')
      expect(
        prepareEncryptedConversion(
          path,
          join(folder, 'encrypted-recovery.sqlite'),
          destination,
          encrypted,
        ),
      ).toEqual({ verified: true, cutoverPerformed: false })
      path = destination
      options.databasePath = destination
      options.databaseSecurity = encrypted
      app = await buildApp(options)
      apps.push(app)
      // Existing authentication session remains valid after separately selecting the candidate.
      expect((await send('GET', '/api/auth/me')).statusCode).toBe(200)
    }
    await check()
    // Snapshot includes every financial module; mutation after snapshot is recoverable.
    const backup = (await ok('POST', '/api/backups', {})).backup
    expect(() =>
      verifySnapshot(join(folder, 'backups', backup.id + '.sqlite'), options.databaseSecurity),
    ).not.toThrow()
    await ok('POST', `${base}/income/sources/${source.id}/archive`, {
      revision: 1,
      isArchived: true,
    })
    await ok('POST', `/api/backups/${backup.id}/restore`, { confirmation: 'RESTORE DATABASE' })
    expect((await send('POST', base + '/expenses/initialize', {})).statusCode).toBe(503)
    await app.close()
    apps.splice(apps.indexOf(app), 1)
    expect(await restoreQueuedSnapshot(path, options.databaseSecurity)).toBe(true)
    app = await buildApp(options)
    apps.push(app)
    expect((await send('GET', '/api/auth/me')).statusCode).toBe(401)
    const login = await send('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'long test password',
    })
    expect(login.statusCode).toBe(200)
    owner.cookie = String(login.headers['set-cookie']).split(';')[0]
    await check()
    expect((await ok('GET', base + '/income')).sources[0].isArchived).toBe(false)
    const sql = openSqlite(path, options.databaseSecurity, { readonly: true })
    try {
      expect(sql.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(sql.pragma('foreign_key_check')).toEqual([])
    } finally {
      sql.close()
    }
  },
  20_000,
)
