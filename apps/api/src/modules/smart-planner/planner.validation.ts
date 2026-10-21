import {
  plannerPaymentTotals,
  advancePaymentLinks,
  plannerInstallmentCents,
  effectiveArrangement,
  activeAdvance,
  type PlannerInput,
  type PlannerRecord,
  type ForecastSources,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
export function validatePlanner(
  v: PlannerInput,
  s: ForecastSources,
  records: PlannerRecord[],
  today: string,
  id?: string,
) {
  const fail = (m: string): never => {
    throw new FinancialError(m, 400)
  }
  const other = records.filter((r) => r.id !== id),
    old = records.find((r) => r.id === id)?.values
  if (
    old &&
    (old.kind !== v.kind ||
      ('target' in old && 'target' in v && JSON.stringify(old.target) !== JSON.stringify(v.target)))
  )
    fail(
      'Record type and obligation links cannot change. Cancel the old plan before creating a replacement.',
    )
  if (v.kind === 'balance') fail('Use Update available balance to create a dated bank observation.')
  if (
    'verification' in v &&
    v.verification.verifiedAt &&
    Date.parse(v.verification.verifiedAt) > Date.now()
  )
    fail('Verification cannot be in the future.')
  if (v.kind === 'preferences' && other.some((r) => r.values.kind === 'preferences'))
    fail('Edit the existing household preferences.')
  if (
    v.kind === 'priority' &&
    other.some(
      (r) =>
        r.values.kind === 'priority' &&
        r.values.target.kind === v.target.kind &&
        r.values.target.id === v.target.id,
    )
  )
    fail('Edit the existing priority for this obligation.')
  if (v.kind === 'allocation') {
    if (v.purpose === 'obligation' && v.target?.kind === 'goal')
      fail('Use a savings or extra-debt reserve for a goal; it is not a contractual bill.')
    if (v.categoryId && !s.categories.some((c) => c.id === v.categoryId))
      fail('Category not found in this household.')
    if (v.goalId && !s.planner?.goals?.some((g) => g.id === v.goalId))
      fail('Goal not found in this household.')
    if (
      other.some(
        (r) =>
          r.values.kind === 'allocation' &&
          r.values.status === 'accepted' &&
          v.status === 'accepted' &&
          JSON.stringify(r.values.target) === JSON.stringify(v.target) &&
          r.values.purpose === v.purpose &&
          r.values.date === v.date &&
          r.values.categoryId === v.categoryId &&
          r.values.goalId === v.goalId,
      )
    )
      fail('An allocation already exists for this target and date. Edit it instead.')
  }
  const isPlan = v.kind === 'arrangement' || v.kind === 'advance'
  if (!isPlan) return
  const debt = v.target.kind === 'debt' ? s.debts.find((d) => d.id === v.target.id) : null
  if (debt?.isArchived) fail('Restore the debt before adding an active arrangement.')
  const active = v.kind === 'arrangement' ? effectiveArrangement(v, today) : activeAdvance(v)
  if (
    active &&
    other.some((r) => {
      const o = r.values
      if (o.kind !== 'arrangement' && o.kind !== 'advance') return false
      if (o.target.kind !== v.target.kind || o.target.id !== v.target.id) return false
      if (v.kind === 'advance' || o.kind === 'advance')
        return activeAdvance(o) || effectiveArrangement(o, today)
      return (
        effectiveArrangement(o, today) &&
        o.coverageStart <= v.coverageEnd &&
        o.coverageEnd >= v.coverageStart
      )
    })
  )
    fail('Overlapping active repayment terms already exist for this obligation.')
  if (active && debt && s.offers.some((o) => o.debtId === debt.id && o.status === 'accepted'))
    fail('The debt already has an accepted settlement. Use its existing schedule.')
  const groups = v.kind === 'arrangement' ? v.installments.map((i) => i.payments) : [v.payments],
    seen = new Set<string>()
  const used = other.flatMap((r) =>
    r.values.kind === 'arrangement'
      ? r.values.installments.flatMap((i) => i.payments)
      : r.values.kind === 'advance'
        ? r.values.payments
        : [],
  )
  for (const group of groups)
    for (const link of group) {
      const key = link.kind + ':' + link.id
      if (seen.has(key) || used.some((p) => p.kind === link.kind && p.id === link.id))
        fail('A payment can be linked to only one repayment installment.')
      seen.add(key)
      if (link.kind === 'debt') {
        const p = s.payments.find((p) => p.id === link.id)
        if (!p || v.target.kind !== 'debt' || p.debtId !== v.target.id)
          fail('Select an existing payment for this debt.')
      } else {
        const b = s.bills.find((b) => b.periods.some((p) => p.id === v.target.id)),
          p = b?.payments.find((p) => p.id === link.id)
        if (!p || v.target.kind !== 'bill_period' || p.periodId !== v.target.id)
          fail('Select an existing payment for this bill period.')
        if (p?.debtPaymentId)
          fail('Use the authoritative linked debt payment in the debt arrangement.')
      }
    }
  if (v.kind === 'arrangement') {
    if (v.target.kind === 'bill_period') {
      const p = s.bills.flatMap((b) => b.periods).find((p) => p.id === v.target.id)
      if (!p || p.amountCents === null || p.amountCents !== v.originalCents)
        fail('Confirm the original bill amount before arranging installments.')
      if (p?.creditCents)
        fail('Reconcile recorded credits before confirming a replacement installment schedule.')
      if (p?.linkedDebtId)
        fail(
          'Create the arrangement on the linked debt so bill and debt deductions stay synchronized.',
        )
    }
    if (debt && debt.currentBalanceCents === null)
      fail('Confirm the existing debt liability before linking a repayment arrangement.')
    if (active) {
      const linked = new Set(
        v.installments.flatMap((i) => i.payments.map((p) => p.kind + ':' + p.id)),
      )
      const unlinked =
        v.target.kind === 'debt'
          ? s.payments.some(
              (p) =>
                p.debtId === v.target.id &&
                p.paymentDate >= v.coverageStart &&
                p.paymentDate <= v.coverageEnd &&
                !['failed', 'cancelled'].includes(p.paymentStatus) &&
                !linked.has('debt:' + p.id),
            )
          : s.bills
              .flatMap((b) => b.payments)
              .some(
                (p) =>
                  p.periodId === v.target.id &&
                  !['failed', 'cancelled'].includes(p.status) &&
                  !linked.has('bill:' + p.id),
              )
      if (unlinked)
        fail('Link existing payments to installments before replacing the original schedule.')
    }
    if (v.arrangementType === 'bnpl') {
      const e = s.expenses.find((e) => e.id === v.expenseId)
      if (
        !e ||
        e.voided ||
        e.paymentMethod !== 'credit_card' ||
        e.linkedDebtId !== v.target.id ||
        e.amountCents !== v.originalCents
      )
        fail(
          'BNPL must reference its existing deferred-cash purchase expense and the same debt liability.',
        )
    }
    if (
      v.status === 'completed' &&
      v.installments.some(
        (i) => plannerPaymentTotals(i.payments, s, today).paidCents < plannerInstallmentCents(i),
      )
    )
      fail('Completed arrangements require authoritative completed payments for every installment.')
  } else {
    if (
      !debt ||
      debt.currentBalanceCents === null ||
      debt.currentBalanceCents > v.repaymentCents ||
      debt.currentBalanceCents < 0
    )
      fail(
        'Record this advance liability in its existing debt before linking it. No duplicate debt or Income will be created.',
      )
    if (v.received && v.receivedDate > today)
      fail('An actual advance receipt cannot be in the future.')
    if (v.sourceId && !s.income.sources.some((i) => i.id === v.sourceId))
      fail('Income source not available.')
    const week = s.payroll?.find((w) => w.id === v.payrollWeekId)
    if (v.repaymentMethod === 'payroll_deduction' && (!week || week.sourceId !== v.sourceId))
      fail('Select a payroll period belonging to the selected employer.')
    if (v.repaymentMethod === 'payroll_deduction' && v.payments.length)
      fail('Payroll deductions cannot also link bank-debit payments.')
    if (
      v.payrollRepaidCents > 0 &&
      (v.repaymentMethod !== 'payroll_deduction' ||
        !week?.reviewedAt ||
        !week.incomeTransactionId ||
        !s.income.transactions.some(
          (t) =>
            t.id === week.incomeTransactionId &&
            t.status === 'confirmed' &&
            t.depositDate &&
            t.depositDate <= today,
        ))
    )
      fail(
        'Confirm the linked reviewed paycheck deposit before acknowledging an actual payroll repayment.',
      )
    if (v.payrollRepaidCents > v.repaymentCents)
      fail('Payroll repayment cannot exceed the agreement.')
    if (v.status === 'completed') {
      if (
        v.repaymentMethod === 'bank_debit' &&
        plannerPaymentTotals(advancePaymentLinks(v, s), s, today).paidCents < v.repaymentCents
      )
        fail('Link completed repayment before marking this advance completed.')
      if (v.repaymentMethod === 'payroll_deduction' && v.payrollRepaidCents < v.repaymentCents)
        fail('Confirm the full payroll deduction before completing the advance.')
    }
  }
}
