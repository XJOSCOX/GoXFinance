import type { ForecastWarnings } from './forecast-warnings'
import { cashOutflows, sumCents } from './outflows'
import { payrollRound } from './payroll-arithmetic'
import type { ForecastEvent, ForecastInput, ForecastSources } from './forecasts'
export const forecastAddDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
export function confirmedForecastActivity(s: ForecastSources, today: string) {
  return [
    ...(s.planner?.records ?? []).flatMap((r) =>
      r.values.kind === 'advance' &&
      r.values.received &&
      ['active', 'completed'].includes(r.values.status) &&
      r.values.receivedDate <= today
        ? [{ id: 'advance-receipt:' + r.id, date: r.values.receivedDate }]
        : [],
    ),
    ...cashOutflows(
      s.expenses,
      s.bills.flatMap((b) => b.payments),
      s.payments,
      today,
      s.refunds,
    )
      .filter((t) => t.cashOutflowCents !== 0)
      .map((t) => ({ id: 'actual:' + t.id, date: t.date })),
    ...s.income.transactions
      .filter((t) => t.status === 'confirmed' && t.depositDate && t.depositDate <= today)
      .map((t) => ({ id: 'income:' + t.id, date: t.depositDate! })),
  ]
}
export function traceForecastEvent(e: ForecastEvent, s: ForecastSources): ForecastEvent {
  if (e.reference) return e
  let reference: ForecastEvent['reference']
  const actual = e.id.startsWith('actual:') ? e.id.slice(7) : ''
  if (actual) {
    const expense = s.expenses.find((x) => x.id === actual),
      debt = s.payments.find((x) => x.id === actual),
      bill = s.bills.find((b) => b.payments.some((p) => p.id === actual)),
      refund = s.refunds?.find((r) => r.id === actual)
    reference = expense
      ? { type: 'expense', id: actual }
      : debt
        ? { type: 'debt_payment', id: actual, parentId: debt.debtId }
        : bill
          ? { type: 'bill_payment', id: actual, parentId: bill.id }
          : refund?.expenseId
            ? { type: 'expense', id: refund.expenseId }
            : refund?.debtPaymentId
              ? {
                  type: 'debt_payment',
                  id: refund.debtPaymentId,
                  parentId: s.payments.find((p) => p.id === refund.debtPaymentId)?.debtId,
                }
              : refund?.billPaymentId
                ? {
                    type: 'bill_payment',
                    id: refund.billPaymentId,
                    parentId: s.bills.find((b) =>
                      b.payments.some((p) => p.id === refund.billPaymentId),
                    )?.id,
                  }
                : { type: 'refund', id: actual }
  } else if (e.id.startsWith('planned-debt:')) {
    const id = e.id.slice(13),
      p = s.payments.find((p) => p.id === id)
    reference = { type: 'debt_payment', id, parentId: p?.debtId }
  } else if (e.id.startsWith('planned-bill:')) {
    const id = e.id.slice(13),
      b = s.bills.find((b) => b.payments.some((p) => p.id === id))
    reference = { type: 'bill_payment', id, parentId: b?.id }
  } else if (e.id.startsWith('obligation:'))
    reference = { type: 'bill', id: e.id.slice(11).split(':')[0] }
  else if (e.id.startsWith('debt-obligation:'))
    reference = { type: 'debt', id: e.id.slice(16).split(':')[0] }
  else if (e.id.startsWith('future-expense:')) reference = { type: 'expense', id: e.id.slice(15) }
  else if (e.id.startsWith('settlement:')) {
    const offer = s.offers.find((o) => o.schedule.some((p) => p.id === e.id.slice(11)))
    reference = { type: 'debt', id: offer?.debtId ?? e.id }
  } else reference = { type: 'scenario', id: e.id }
  return {
    ...e,
    reference,
    classification:
      e.amountCents === null
        ? 'unknown'
        : !e.estimated
          ? 'confirmed_cash'
          : e.direction === 'in'
            ? 'assumed_income'
            : ['pending', 'scheduled'].includes(e.kind)
              ? 'scheduled_obligation'
              : 'estimated_obligation',
    confidence: e.estimated ? 'estimated' : 'confirmed',
    basis: !e.estimated
      ? 'Completed authoritative cash activity; linked payments count once.'
      : ['pending', 'scheduled'].includes(e.kind)
        ? 'Recorded outgoing payment; not yet counted as completed.'
        : e.kind === 'scenario'
          ? 'Explicit additional scenario assumption.'
          : 'Existing bill period, saved estimate or debt obligation; planned/completed coverage is deducted once.',
  }
}
export function prepareSmartEvent(
  e: ForecastEvent,
  v: ForecastInput,
  warnings: ForecastWarnings,
): ForecastEvent | null {
  const smart = v.smart!
  let event = { ...e }
  const actual =
    !event.estimated && ['confirmed_cash', 'borrowed_cash'].includes(event.classification ?? '')
  if (actual && event.amountCents !== 0) {
    const opening = smart.opening
    if (opening) {
      if (opening.includedActivityIds.includes(event.id)) {
        if (event.date !== opening.effectiveDate)
          warnings.push(
            `An activity included in opening cash has a changed date: ${event.name}. Reconfirm cash timing.`,
          )
        return null
      }
      if (event.date < opening.effectiveDate) return null
      if (event.date === opening.effectiveDate) {
        warnings.push(
          `Cash timing uncertain on opening date: ${event.name}. Confirm whether it is already included in opening cash.`,
        )
        return null
      }
      if (event.date < v.startDate)
        event = {
          ...event,
          originalDate: event.date,
          date: v.startDate,
          basis:
            (event.basis ?? '') +
            ' Carried forward after opening cash; original activity date is retained.',
        }
    }
  } else if (event.direction === 'in') {
    const adjustment = smart.incomeAdjustments.find((a) => a.eventId === event.id)
    if (adjustment?.excluded) return null
    if (adjustment) {
      const base = event.date
      event = {
        ...event,
        date: forecastAddDays(base, adjustment.delayDays),
        originalDate: event.originalDate ?? base,
        amountCents:
          event.amountCents === null
            ? null
            : payrollRound(
                BigInt(event.amountCents) * BigInt(10000 - adjustment.reductionBps),
                10000n,
              ),
        basis:
          (event.basis ?? '') +
          ` Scenario: ${adjustment.delayDays} day delay; ${adjustment.reductionBps / 100}% smaller. Original payroll is unchanged.`,
      }
    }
    if (event.date < v.startDate) {
      warnings.push(
        `Expected income is overdue; arrival date requires review: ${event.name} (${event.date}).`,
      )
      event = { ...event, originalDate: event.originalDate ?? event.date, date: v.startDate }
    }
  } else {
    const adjustment = smart.postponedPayments.find((a) => a.eventId === event.id)
    if (adjustment) {
      event = {
        ...event,
        originalDate: event.date,
        date: forecastAddDays(event.date, adjustment.delayDays),
        basis:
          (event.basis ?? '') +
          ' Optional timing scenario only; creditor due date and actual payment are unchanged.',
      }
    }
  }
  return event
}
export function availableCashAccounts(s: ForecastSources, now: string) {
  return (s.cashAccounts ?? []).filter(
    (a) =>
      a.status === 'active' &&
      a.type !== 'credit_card' &&
      a.currency === 'USD' &&
      a.balance?.source === 'manual' &&
      a.balance.availableCents !== null &&
      Date.parse(a.balance.observedAt) <= Date.parse(now) &&
      Date.parse(now) - Date.parse(a.balance.observedAt) <= 86400000,
  )
}
export function selectedOpeningTotal(accounts: { availableCents: number }[]) {
  return sumCents(accounts.map((a) => a.availableCents))
}
