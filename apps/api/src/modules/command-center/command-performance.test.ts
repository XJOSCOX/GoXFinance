import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { cpus, platform, release } from 'node:os'
import { fixture, statement } from '../payroll/payroll.fixture'
import { testUser } from '../../testing/workspace'
import { openSqlite } from '../../db/encryption/sqlite-engine'
import {
  createDebtSchema,
  localBillDate,
  plannerInputSchema,
  type CommandCenter,
} from '@goxfinance/shared'
const shift = (date: string, days: number) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
it.runIf(process.env.GOX_COMMAND_BENCH === '1')(
  'benchmarks one authorized summary with a large synthetic household',
  async () => {
    const f = await fixture(),
      today = localBillDate()
    const editor = await testUser(f.app, 'BenchEditor'),
      viewer = await testUser(f.app, 'BenchViewer')
    f.grant(editor.id, 'editor')
    f.grant(viewer.id, 'viewer')
    await f.ok('POST', `/income/payroll/weeks/${f.w.id}/review`, {
      revision: f.w.revision,
      reason: 'Synthetic benchmark statement',
      statement,
      documentDigest: 'b'.repeat(64),
    })
    await f.ok('POST', '/expenses/initialize')
    const category = (await f.ok('GET', '/categories')).categories[0]
    await f.ok('POST', '/expenses', {
      idempotencyKey: randomUUID(),
      expense: {
        description: 'Synthetic benchmark purchase',
        merchant: 'Fictional store',
        amountCents: 2000,
        transactionDate: today,
        responsibleMemberId: f.member,
        paymentMethod: 'debit_card',
        linkedDebtId: null,
        notes: null,
        allocations: [{ categoryId: category.id, amountCents: 2000 }],
      },
    })
    const db = openSqlite(f.options.databasePath, f.options.databaseSecurity)
    type Row = Record<string, string | number | null>
    const one = (table: string) => db.prepare('SELECT * FROM ' + table + ' LIMIT 1').get() as Row
    const add = (table: string, row: Row) =>
      db
        .prepare(
          `INSERT INTO ${table} (${Object.keys(row)
            .map((k) => '"' + k + '"')
            .join(',')}) VALUES (${Object.keys(row)
            .map(() => '?')
            .join(',')})`,
        )
        .run(...Object.values(row))
    const week = one('payroll_weeks'),
      stub = one('payroll_statements'),
      income = one('income_transactions'),
      forecast = one('payroll_forecasts'),
      lines = db.prepare('SELECT * FROM payroll_lines').all() as Row[],
      expense = one('expenses'),
      allocation = one('expense_category_allocations')
    try {
      db.transaction(() => {
        for (let i = 1; i <= 53; i++) {
          const start = shift(today, -7 * i - 4),
            end = shift(start, 6),
            pay = shift(end, 5),
            wid = randomUUID(),
            sid = randomUUID(),
            tid = randomUUID()
          add('income_transactions', {
            ...income,
            id: tid,
            idempotency_key: randomUUID(),
            paycheck_key: 'period:' + start + ':' + end,
            work_period_start: start,
            work_period_end: end,
            pay_date: pay,
            regular_pay_date: pay,
            deposit_date: pay,
            status: 'confirmed',
            receipt_confirmed: 1,
            confirmed_at: pay + 'T12:00:00Z',
            actual_net_cents: 80000,
            actual_gross_cents: 100000,
          })
          const hours = {
            ...JSON.parse(String(week.hours_json)),
            workweekStart: start,
            workweekEnd: end,
            expectedPayDate: pay,
          }
          add('payroll_weeks', {
            ...week,
            id: wid,
            idempotency_key: randomUUID(),
            workweek_start: start,
            workweek_end: end,
            hours_json: JSON.stringify(hours),
            statement_id: sid,
            income_transaction_id: tid,
            stage: 'deposit_confirmed',
          })
          add('payroll_statements', {
            ...stub,
            id: sid,
            week_id: wid,
            document_digest: null,
            header_json: JSON.stringify({
              ...JSON.parse(String(stub.header_json)),
              periodStart: start,
              periodEnd: end,
              payDate: pay,
            }),
          })
          for (const line of lines)
            add('payroll_lines', { ...line, id: randomUUID(), statement_id: sid })
          add('payroll_forecasts', { ...forecast, id: randomUUID(), week_id: wid })
        }
        for (let i = 1; i < 480; i++) {
          const id = randomUUID()
          add('expenses', {
            ...expense,
            id,
            idempotency_key: randomUUID(),
            transaction_date: shift(today, -(i % 365)),
            merchant: 'Synthetic merchant ' + (i % 20),
          })
          add('expense_category_allocations', { ...allocation, expense_id: id })
        }
      }).immediate()
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
    for (let i = 0; i < 8; i++)
      await f.ok('POST', '/bills', {
        name: i ? 'Fictional utility ' + i : 'Fictional rent',
        category: 'Utilities',
        kind: 'recurring',
        amountType: 'fixed',
        amountCents: 10000 + i * 5000,
        estimatedAmountCents: null,
        frequency: 'monthly',
        nextDueDate: shift(today, i + 1),
        endDate: null,
        autoPay: false,
        status: 'active',
        notes: null,
        linkedDebtId: null,
        memberIds: [f.member],
      })
    for (let i = 0; i < 8; i++) {
      const debt = (
        await f.ok(
          'POST',
          '/debts',
          createDebtSchema.parse({
            creditorName: 'Synthetic debt ' + i,
            accountType: 'personal_loan',
            currentBalanceCents: 100000,
            minimumPaymentCents: 12000,
            nextDueDate: shift(today, 5),
            memberAssignments: [{ memberId: f.member, responsibility: 'joint' }],
          }),
        )
      ).debt
      if (i < 4) {
        const values = plannerInputSchema.parse({
          kind: 'debt_plan',
          name: 'Synthetic plan ' + i,
          target: { kind: 'debt', id: debt.id },
          mode: 'pay_by_date',
          amountCents: 12000,
          startDate: today,
          deadline: shift(today, 5 + i),
          amountBasis: 'custom',
          verification: { verified: false },
          status: 'confirmed',
        })
        await f.ok('POST', '/planner/records', {
          values,
          fingerprint: (await f.ok('GET', '/planner')).fingerprint,
          revision: 0,
          idempotencyKey: randomUUID(),
          reason: 'Synthetic benchmark plan',
        })
      }
    }
    // Synthetic budget and feedback history use the same schemas/repositories as normal requests.
    const sql = openSqlite(f.options.databasePath, f.options.databaseSecurity),
      stamp = new Date().toISOString()
    sql
      .transaction(() => {
        for (let i = 0; i < 12; i++) {
          const id = randomUUID(),
            month = shift(today, -i * 31).slice(0, 7)
          sql
            .prepare(
              'INSERT OR IGNORE INTO budget_months(id,household_id,created_by_user_id,idempotency_key,month,scope_key,responsible_member_id,total_cents,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              id,
              f.home,
              f.owner.id,
              randomUUID(),
              month,
              'household',
              null,
              350000,
              'active',
              1,
              stamp,
              stamp,
            )
        }
        for (let i = 0; i < 60; i++) {
          const id = randomUUID()
          sql
            .prepare(
              'INSERT INTO insight_records(id,household_id,actor_user_id,insight_id,kind,revision,values_json,snapshot_json,fingerprint,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              id,
              f.home,
              f.owner.id,
              'synthetic-history-' + i,
              'feedback',
              1,
              JSON.stringify({
                kind: 'feedback',
                insightId: 'synthetic-history-' + i,
                status: 'dismissed',
              }),
              JSON.stringify({ ownerOnly: false, scopeRefs: [] }),
              'a'.repeat(64),
              stamp,
              stamp,
            )
        }
      })
      .immediate()
    sql.close()
    const results: number[] = [],
      sizes: number[] = []
    for (let i = 0; i < 22; i++) {
      const start = performance.now(),
        res = await f.send('GET', '/command-center')
      const ms = performance.now() - start
      expect(res.statusCode, res.body).toBe(200)
      const d = res.json() as CommandCenter
      expect(d.schemaVersion).toBe(1)
      if (i >= 2) {
        results.push(ms)
        sizes.push(Buffer.byteLength(res.body))
      }
    }
    results.sort((a, b) => a - b)
    console.log(
      JSON.stringify({
        benchmark: 'Phase21',
        environment: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0].model,
          node: process.version,
        },
        fixture: {
          users: 3,
          payrollPeriods: 54,
          expenses: 480,
          recurringBills: 8,
          debts: 8,
          plans: 4,
          budgetMonths: 12,
          insightHistory: 60,
        },
        requests: results.length,
        ms: {
          min: results[0],
          median: results[Math.floor(results.length / 2)],
          p95: results[Math.ceil(results.length * 0.95) - 1],
          max: results.at(-1),
        },
        responseBytes: Math.max(...sizes),
      }),
    )
  },
  60000,
)
