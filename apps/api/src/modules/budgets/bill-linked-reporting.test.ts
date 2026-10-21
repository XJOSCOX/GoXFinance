import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  localBillDate,
  billPeriodPlannedRemaining,
  type BillInput,
  type BillView,
} from '@goxfinance/shared'
import { setup } from '../../testing/financial-workspace'
import { testRequest } from '../../testing/workspace'

it.each([false, true])(
  'recalculates linked reports after bill estimates, actuals and payment corrections; encrypted=%s',
  async (encrypted) => {
    const f = await setup(encrypted),
      today = localBillDate(),
      month = today.slice(0, 7)
    const category = (await f.ok('GET', '/categories')).categories[0]
    const values: BillInput = {
      name: 'Fictional electricity',
      category: category.name,
      categoryId: category.id,
      kind: 'recurring',
      amountType: 'variable',
      amountCents: null,
      estimatedAmountCents: 30000,
      frequency: 'monthly',
      nextDueDate: today,
      endDate: null,
      autoPay: false,
      status: 'active',
      notes: null,
      linkedDebtId: null,
      memberIds: [f.member],
    }
    const bill = (await f.ok('POST', '/bills', values)).bill as BillView
    const period = bill.periods[0]
    await f.ok('POST', '/budgets', {
      idempotencyKey: randomUUID(),
      values: {
        month,
        responsibleMemberId: null,
        totalCents: 50000,
        status: 'active',
        notes: null,
        limits: [{ categoryId: category.id, amountCents: 20000 }],
      },
    })
    const changeEstimate = (estimatedAmountCents: number | null) =>
      f.ok('POST', `/bills/${bill.id}/actions`, {
        action: 'edit_bill',
        changes: { ...values, estimatedAmountCents },
      })
    async function reports(estimate: number | null, actual: number | null, paid: number) {
      const budget = await f.ok('GET', '/budgets?month=' + month)
      expect(budget.bills.find((p: { id: string }) => p.id === period.id)).toMatchObject({
        name: values.name,
        estimateCents: estimate,
        billedCents: actual,
        paidCents: paid,
        remainingCents: actual === null ? null : Math.max(0, actual - paid),
      })
      expect(budget.actualCents).toBe(paid)
      expect(budget.remainingCents).toBe(50000 - paid)
      expect(budget.budget).toMatchObject({
        totalCents: 50000,
        revision: 1,
        limits: [{ categoryId: category.id, amountCents: 20000 }],
      })
      const overview = await f.ok('GET', '/overview?month=' + month)
      expect(overview.payments.billAmounts).toMatchObject({
        estimatedCents: estimate ?? 0,
        confirmedCents: actual ?? 0,
        paidCents: paid,
        remainingCents: actual === null ? 0 : Math.max(0, actual - paid),
      })
      const planner = await f.ok('GET', '/planner'),
        forecast = await f.ok('GET', '/forecasts/smart?days=7')
      const source = planner.sources.bills.find((b: BillView) => b.id === bill.id) as BillView
      const current = source.periods.find((p) => p.id === period.id)!
      expect(current.budgetEstimateCents).toBe(estimate)
      expect(billPeriodPlannedRemaining(source, current, today).amountCents).toBe(
        actual === null && estimate === null ? null : Math.max(0, (actual ?? estimate!) - paid),
      )
      const event = forecast.report.events.find(
        (e: { id: string }) => e.id === `obligation:${bill.id}:${today}`,
      )
      expect(event?.amountCents).toBe(
        actual === null && estimate === null ? null : Math.max(0, (actual ?? estimate!) - paid),
      )
      return budget
    }
    await changeEstimate(40000)
    await reports(40000, null, 0)
    expect((await f.ok('GET', '/bills/' + bill.id)).bill.periods[0].estimatedAmountCents).toBe(
      30000,
    )
    await changeEstimate(null)
    await reports(null, null, 0)
    await changeEstimate(35000)
    await f.ok('POST', `/bills/${bill.id}/actions`, {
      action: 'edit_period',
      periodId: period.id,
      changes: { amountCents: 34218, creditCents: 0, notes: 'Fictional statement' },
    })
    const payment = (
      await f.ok('POST', `/bills/${bill.id}/periods/${period.id}/payments`, {
        idempotencyKey: randomUUID(),
        amountCents: 20000,
        paymentDate: today,
        method: 'cash',
        status: 'completed',
        notes: null,
      })
    ).bill.payments[0]
    await changeEstimate(50000)
    await reports(35000, 34218, 20000)
    await f.ok('POST', `/bills/${bill.id}/actions`, {
      action: 'edit_payment',
      paymentId: payment.id,
      changes: {
        amountCents: 10000,
        paymentDate: today,
        method: 'cash',
        notes: 'Fictional correction',
      },
    })
    await reports(35000, 34218, 10000)
    await f.ok('POST', `/bills/${bill.id}/actions`, {
      action: 'cancel_payment',
      paymentId: payment.id,
    })
    const before = await reports(35000, 34218, 0)
    const next = await f.restart()
    const after = (
      await testRequest(next, 'GET', f.base + '/budgets?month=' + month, f.owner.cookie)
    ).json()
    expect(after).toEqual(before)
  },
  20000,
)
