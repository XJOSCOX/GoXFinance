import { plannerMoney } from './planner-display'
import type { ForecastSources, ForecastInput, ForecastEvent } from './forecasts'
import {
  activeAdvance,
  advancePaymentLinks,
  effectiveArrangement,
  plannerInstallmentCents,
  plannerPaymentTotals,
} from './planner-payments'
import { sumCents } from './outflows'
import type { PlannerInput } from './planner'
import { debtPlanProblem, debtPlanIds } from './debt-payment-plans'
export function plannerCashFlow(s: ForecastSources, v: ForecastInput, today: string) {
  const records = s.planner?.records ?? [],
    warnings: string[] = [],
    events: ForecastEvent[] = [],
    covered: { debtId: string; start: string; end: string }[] = [],
    periods: string[] = [],
    billSchedules: { debtId: string; start: string; end: string }[] = []
  const incomeDeductions = new Map<string, { amount: number; treatment: string }>()
  const confirmedIds = new Set<string>(
    s.offers.filter((o) => o.status === 'accepted' && o.writtenConfirmed).map((o) => o.debtId),
  )
  for (const r of records) {
    const p = r.values
    if (
      (p.kind === 'debt_plan' && !debtPlanProblem(p, s, today)) ||
      (p.kind === 'arrangement' && effectiveArrangement(p, today)) ||
      (p.kind === 'advance' && activeAdvance(p))
    )
      if ('target' in p && p.target?.kind === 'debt') confirmedIds.add(p.target.id)
  }
  const unconfirmed = s.plannerConfirmedDebtsOnly
    ? s.debts.filter((d) => !confirmedIds.has(d.id)).map((d) => d.id)
    : []
  if (unconfirmed.length)
    warnings.push(
      `${unconfirmed.length} debt accounts need payment-plan confirmation. Reported balances and unreviewed minimums are excluded; existing bills and recorded payments remain included.`,
    )
  const add = (e: ForecastEvent) => events.push(e)
  for (const r of records) {
    const p = r.values
    if (p.kind === 'debt_plan' && p.status === 'confirmed' && p.replaceOriginal) {
      const problem = debtPlanProblem(p, s, today)
      if (!problem)
        for (const debtId of debtPlanIds(p, s)) {
          const coverage = { debtId, start: p.startDate, end: p.deadline }
          if (p.mode === 'linked_bill') billSchedules.push(coverage)
          else covered.push(coverage)
        }
    }
    if (effectiveArrangement(p, today) && p.kind === 'arrangement') {
      if (
        p.target.kind === 'debt' &&
        s.offers.some((o) => o.debtId === p.target.id && o.status === 'accepted')
      ) {
        warnings.push(
          `Conflicting accepted settlement and installment terms: ${p.name}. Review the existing settlement; the additional arrangement is not substituted.`,
        )
        continue
      }
      const linked = new Set(
        p.installments.flatMap((i) => i.payments.map((p) => p.kind + ':' + p.id)),
      )
      const unlinked =
        p.target.kind === 'debt'
          ? s.payments.some(
              (x) =>
                x.debtId === p.target.id &&
                x.paymentDate >= p.coverageStart &&
                x.paymentDate <= p.coverageEnd &&
                !['cancelled', 'failed'].includes(x.paymentStatus) &&
                !linked.has('debt:' + x.id),
            )
          : s.bills
              .flatMap((b) => b.payments)
              .some(
                (x) =>
                  x.periodId === p.target.id &&
                  !['cancelled', 'failed'].includes(x.status) &&
                  !linked.has('bill:' + x.id),
              )
      const billPeriod = s.bills.flatMap((b) => b.periods).find((x) => x.id === p.target.id)
      if (
        unlinked ||
        (billPeriod && (billPeriod.amountCents !== p.originalCents || billPeriod.creditCents > 0))
      ) {
        warnings.push(
          `Reconcile changed amounts, credits or unlinked payments for ${p.name}. The original obligation remains in the projection until its arrangement links are reviewed.`,
        )
        continue
      }
      if (p.target.kind === 'bill_period') periods.push(p.target.id)
      else covered.push({ debtId: p.target.id, start: p.coverageStart, end: p.coverageEnd })
      for (const item of p.installments) {
        const totals = plannerPaymentTotals(item.payments, s, today),
          amount = Math.max(
            0,
            plannerInstallmentCents(item) -
              totals.paidCents -
              totals.pendingCents -
              totals.scheduledCents,
          )
        if (amount)
          add({
            id: `installment:${r.id}:${item.id}`,
            date: item.date < v.startDate ? v.startDate : item.date,
            originalDate: item.date,
            name: `${p.name} installment`,
            amountCents: amount,
            direction: 'out',
            kind: 'installment',
            estimated: true,
            classification: 'scheduled_obligation',
            reference: { type: 'planner', id: r.id },
            basis: `Verified accepted ${p.arrangementType} arrangement. Original obligation is replaced only for its confirmed coverage. Partial payment is not assumed legally sufficient.`,
            confidence: 'estimated',
          })
      }
    }
    if (activeAdvance(p) && p.kind === 'advance') {
      covered.push({ debtId: p.target.id, start: v.startDate, end: v.endDate })
      if (!p.received) {
        warnings.push(
          `Advance receipt is not confirmed: ${p.name}. No borrowed cash is available from this arrangement.`,
        )
      }
      if (p.received)
        add({
          id: 'advance-receipt:' + r.id,
          date: p.receivedDate,
          name: p.provider + ' advance received',
          amountCents: p.receivedCents,
          direction: 'in',
          kind: 'advance_receipt',
          estimated: false,
          classification: 'borrowed_cash',
          reference: { type: 'planner', id: r.id },
          confidence: 'confirmed',
          basis:
            'Actual borrowed/accelerated cash, not earned salary or household Income. The existing linked debt owns the liability.',
        })
      const totals = plannerPaymentTotals(advancePaymentLinks(p, s), s, today),
        amount = Math.max(
          0,
          p.repaymentCents -
            (p.payrollRepaidCents ?? 0) -
            totals.paidCents -
            totals.pendingCents -
            totals.scheduledCents,
        )
      if (p.repaymentMethod === 'bank_debit') {
        if (amount)
          add({
            id: 'advance-repay:' + r.id,
            date: p.repaymentDate < v.startDate ? v.startDate : p.repaymentDate,
            originalDate: p.repaymentDate,
            name: p.provider + ' advance repayment',
            amountCents: amount,
            direction: 'out',
            kind: 'advance_repayment',
            estimated: true,
            classification: 'scheduled_obligation',
            reference: { type: 'planner', id: r.id },
            confidence: 'estimated',
            basis:
              'Verified repayment terms less authoritative linked payments. Fees, tips and expedited charges are disclosed separately; no new salary is created.',
          })
      } else {
        if (p.payrollWeekId) {
          const old = incomeDeductions.get(p.payrollWeekId)
          incomeDeductions.set(p.payrollWeekId, {
            amount: sumCents([
              old?.amount ?? 0,
              Math.max(0, p.repaymentCents - (p.payrollRepaidCents ?? 0)),
            ]),
            treatment:
              old && old.treatment !== p.deductionTreatment ? 'unknown' : p.deductionTreatment,
          })
        }
        if (p.deductionTreatment === 'unknown')
          warnings.push(
            `Payroll advance deduction inclusion is unknown: ${p.name}. Confirm whether the saved net already includes repayment.`,
          )
        add({
          id: 'advance-deduction:' + r.id,
          date: p.repaymentDate < v.startDate ? v.startDate : p.repaymentDate,
          name: p.provider + ' payroll deduction',
          amountCents: p.deductionTreatment === 'unknown' ? null : 0,
          direction: 'out',
          kind: 'payroll_deduction',
          estimated: true,
          classification: 'scheduled_obligation',
          reference: { type: 'planner', id: r.id },
          basis: `${plannerMoney(p.repaymentCents)} repaid through payroll. Included net is never charged again as a bank debit. Actual payroll confirmation is required to resolve liability.`,
          confidence: 'estimated',
        })
      }
    }
  }
  const hypothetical = v.planning?.hypotheticalAdvance
  if (hypothetical) {
    add({
      id: 'hypothetical-advance',
      date: hypothetical.receivedDate,
      name: 'Hypothetical borrowed cash',
      amountCents: hypothetical.amountCents,
      direction: 'in',
      kind: 'advance_receipt',
      estimated: true,
      classification: 'borrowed_cash',
      basis: 'Explicit simulation only; no advance is requested or received.',
    })
    add({
      id: 'hypothetical-repayment',
      date: hypothetical.repaymentDate,
      name: 'Hypothetical advance repayment',
      amountCents: sumCents([hypothetical.amountCents, hypothetical.feesCents]),
      direction: 'out',
      kind: 'advance_repayment',
      estimated: true,
      classification: 'scheduled_obligation',
      basis: 'Explicit hypothetical principal plus fees; terms are not provider confirmed.',
    })
  }
  if (v.planning?.utilityIncreaseCents)
    add({
      id: 'hypothetical-utility',
      date: v.startDate,
      name: 'Hypothetical utility increase',
      amountCents: v.planning.utilityIncreaseCents,
      direction: 'out',
      kind: 'scenario',
      estimated: true,
      classification: 'estimated_obligation',
    })
  const pending = new Map<string, number>()
  for (const c of records
    .map((r) => r.values)
    .filter((p): p is Extract<PlannerInput, { kind: 'balance' }> => p.kind === 'balance')) {
    if (
      !v.smart?.opening?.accounts.some(
        (a) => a.accountId === c.accountId && a.balanceId === c.balanceId,
      )
    )
      continue
    if (c.pendingIncluded === 'unknown')
      warnings.push(
        'A selected available balance has unknown pending-debit inclusion. Confirm pending holds before relying on projected cash.',
      )
    if (c.pendingIncluded === 'yes')
      for (const item of c.includedPending) pending.set(item.eventId, item.amountCents)
  }
  for (const [key] of pending) {
    const id = key.replace(/^planned-(?:bill|debt):/, '')
    const payment = [...s.payments, ...s.bills.flatMap((b) => b.payments)].find((p) => p.id === id)
    if (
      !payment ||
      ('paymentStatus' in payment ? payment.paymentStatus : payment.status) === 'cancelled'
    )
      warnings.push(
        'A captured pending hold was cancelled or removed. Confirm a fresh available balance; release timing is unknown.',
      )
  }
  return {
    sources: {
      ...s,
      plannerUnconfirmedDebtIds: unconfirmed,
      plannerCoveredDebts: covered,
      plannerBillSchedules: billSchedules,
      plannerSuppressedPeriods: periods,
    },
    events,
    warnings,
    adjust(e: ForecastEvent): ForecastEvent | null {
      let event = { ...e }
      if (event.kind === 'expected_income' && event.reference?.type === 'payroll') {
        const deduction = incomeDeductions.get(event.reference.id)
        if (
          deduction?.treatment === 'subtract_forecast' &&
          event.classification === 'payroll_forecast'
        ) {
          if (event.amountCents !== null && deduction.amount > event.amountCents)
            warnings.push(
              'An advance deduction exceeds the known forecast take-home; the remaining repayment needs verification.',
            )
          event = {
            ...event,
            amountCents:
              event.amountCents === null ? null : Math.max(0, event.amountCents - deduction.amount),
            basis:
              (event.basis ?? '') +
              ' Subtracts the explicit advance deduction once from this pre-deduction forecast.',
          }
        } else if (deduction?.treatment === 'unknown') event = { ...event, amountCents: null }
      }
      const key = event.id.startsWith('actual:')
        ? (event.reference?.type === 'bill_payment' ? 'planned-bill:' : 'planned-debt:') +
          event.id.slice(7)
        : event.id
      const included = pending.get(key)
      if (included !== undefined && event.amountCents !== null) {
        const delta = event.amountCents - included
        if (delta === 0) return null
        event = {
          ...event,
          amountCents: Math.abs(delta),
          direction: delta < 0 ? 'in' : 'out',
          kind: delta < 0 ? 'refund' : event.kind,
          basis:
            (event.basis ?? '') +
            ' Only the change from the pending hold already included in opening available cash is applied.',
        }
      }
      return event
    },
  }
}
