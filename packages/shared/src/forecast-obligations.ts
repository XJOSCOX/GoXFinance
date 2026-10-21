import { billPeriodEstimate } from './bill-calculations'
import { budgetFromBills } from './budget-planning'
import { sumCents, paymentNetCents } from './outflows'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import type { ForecastSources, ForecastInput, ForecastEvent } from './forecasts'
export function forecastObligations(
  s: ForecastSources,
  v: ForecastInput,
  today: string,
  months: string[],
  add: (e: ForecastEvent) => void,
  warnings: string[],
) {
  const inside = (d: string) => d >= v.startDate && d <= v.endDate
  const plannedDate = (date: string) => (v.smart && date < v.startDate ? v.startDate : date)
  const plannerCovered = (id: string, date: string) =>
    (s.plannerCoveredDebts ?? []).some((c) => c.debtId === id && date >= c.start && date <= c.end)
  const confirmedBillSchedule = (id: string, date: string) =>
    (s.plannerBillSchedules ?? []).some((c) => c.debtId === id && date >= c.start && date <= c.end)
  const debtGroups = debtObligationGroups(s.debts),
    groupId = (id: string) => debtGroups.find((g) => g.some((d) => d.id === id))?.[0].id ?? id
  const commitments = new Map<
      string,
      { amount: number | null; date: string; name: string; id: string }
    >(),
    planned = new Map<string, number>()
  const credit = (debtId: string, date: string, amount: number) => {
    const key = groupId(debtId) + ':' + date.slice(0, 7)
    planned.set(key, sumCents([planned.get(key) ?? 0, amount]))
  }
  const requireDebt = (debtId: string, date: string, amount: number | null, name: string) => {
    const id = groupId(debtId),
      key = id + ':' + date.slice(0, 7),
      old = commitments.get(key)
    commitments.set(key, {
      id,
      date: old && old.date < date ? old.date : date,
      amount:
        amount === null
          ? (old?.amount ?? null)
          : old?.amount === null || !old
            ? amount
            : Math.max(old.amount, amount),
      name,
    })
  }
  for (const p of new Map(s.payments.map((p) => [p.id, p])).values()) {
    if (p.paymentStatus === 'completed' && p.paymentDate <= today)
      credit(p.debtId, p.paymentDate, paymentNetCents(p, today))
    if (
      (['scheduled', 'pending'].includes(p.paymentStatus) ||
        (p.paymentStatus === 'completed' && p.paymentDate > today)) &&
      inside(plannedDate(p.paymentDate))
    ) {
      add({
        id: 'planned-debt:' + p.id,
        date: plannedDate(p.paymentDate),
        originalDate: p.paymentDate,
        name: 'Debt payment (' + p.paymentStatus + ')',
        amountCents: p.paymentMethod === 'credit_card' ? 0 : p.amountCents,
        direction: 'out',
        kind: p.paymentStatus === 'pending' ? 'pending' : 'scheduled',
        estimated: true,
      })
      if (v.smart && p.paymentDate < v.startDate)
        warnings.push(
          'Outstanding debt payment has a past recorded date; its projected timing requires confirmation.',
        )
      credit(p.debtId, plannedDate(p.paymentDate), p.amountCents)
    }
  }
  if (v.smart)
    for (const group of debtGroups) {
      const d = representativeDebtBalance(group)
      const pastDue = Math.max(...group.map((r) => r.pastDueAmountCents ?? 0))
      if (
        pastDue > 0 &&
        !group.every((d) => s.plannerUnconfirmedDebtIds?.includes(d.id)) &&
        d.currentBalanceCents !== 0 &&
        !group.some(
          (d) => plannerCovered(d.id, v.startDate) || confirmedBillSchedule(d.id, v.startDate),
        )
      ) {
        requireDebt(d.id, v.startDate, pastDue, d.accountNickname || d.creditorName)
        warnings.push(
          `Past-due debt amount may overlap the current contractual minimum: ${d.creditorName}. The larger monthly requirement is used; confirm the actual amount and timing.`,
        )
      }
    }
  for (const month of months)
    for (const group of debtGroups) {
      const d = representativeDebtBalance(group)
      if (group.every((d) => s.plannerUnconfirmedDebtIds?.includes(d.id))) continue
      if (d.currentBalanceCents === 0) continue
      const day = d.dueDay ?? (d.nextDueDate ? Number(d.nextDueDate.slice(-2)) : null)
      if (group.every((r) => r.minimumPaymentCents === null))
        warnings.push(`Missing contractual minimum: ${d.creditorName}`)
      if (day === null) {
        warnings.push(`Missing debt due date: ${d.creditorName}`)
        continue
      }
      const last = new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
        ).getUTCDate(),
        date = month + '-' + String(Math.min(day, last)).padStart(2, '0')
      if (
        (!v.smart && !inside(date)) ||
        date > v.endDate ||
        (d.nextDueDate && date < d.nextDueDate)
      )
        continue
      const amount = group.some((r) => r.minimumPaymentCents !== null)
        ? Math.max(...group.map((r) => r.minimumPaymentCents ?? 0))
        : null
      if (
        group.some(
          (d) =>
            plannerCovered(d.id, plannedDate(date)) ||
            confirmedBillSchedule(d.id, plannedDate(date)),
        )
      )
        continue
      requireDebt(
        d.id,
        plannedDate(date),
        v.smart && date < v.startDate && d.pastDueAmountCents != null
          ? Math.max(amount ?? 0, d.pastDueAmountCents)
          : amount,
        d.accountNickname || d.creditorName,
      )
    }
  // A payment date is independent of its bill's due date (including early payments).
  if (v.smart)
    for (const bill of s.bills)
      for (const pay of bill.payments) {
        if (
          pay.debtPaymentId ||
          !(
            ['pending', 'scheduled'].includes(pay.status) ||
            (pay.status === 'completed' && pay.paymentDate > today)
          ) ||
          !inside(plannedDate(pay.paymentDate))
        )
          continue
        add({
          id: 'planned-bill:' + pay.id,
          date: plannedDate(pay.paymentDate),
          originalDate: pay.paymentDate,
          name: bill.name + ' (' + pay.status + ')',
          amountCents: pay.method === 'credit_card' ? 0 : pay.amountCents,
          spendingCents: pay.amountCents,
          direction: 'out',
          kind: pay.status === 'pending' ? 'pending' : 'scheduled',
          estimated: true,
        })
        if (pay.paymentDate < v.startDate)
          warnings.push(`Outstanding payment timing requires confirmation: ${bill.name}`)
      }
  const linkedBills = new Map<
    string,
    { debtId: string; date: string; amount: number | null; name: string }
  >()
  for (const bill of s.bills.filter((b) => b.status === 'active')) {
    const dates = new Map(
      months
        .flatMap((month) => budgetFromBills([bill], s.categories, month, null).rows)
        .map((r) => [r.dueDate, r]),
    )
    for (const p of bill.periods.filter(
      (p) =>
        p.dueDate < v.startDate &&
        p.paymentStatus !== 'cancelled' &&
        !['paid', 'credited', 'overpaid'].includes(p.paymentStatus),
    ))
      dates.set(p.dueDate, {
        billId: bill.id,
        name: p.name,
        dueDate: p.dueDate,
        amountCents: p.amountCents ?? billPeriodEstimate(p),
        basis: 'Overdue',
        included: true,
      })
    for (const row of dates.values()) {
      const p = bill.periods.find((p) => p.dueDate === row.dueDate),
        date = row.dueDate < v.startDate ? v.startDate : row.dueDate,
        link = p ? p.linkedDebtId : bill.linkedDebtId
      if (
        !inside(date) ||
        (p && s.plannerSuppressedPeriods?.includes(p.id)) ||
        (link && plannerCovered(link, date))
      )
        continue
      if (link) {
        if (row.amountCents === null) warnings.push(`Unknown linked bill amount: ${row.name}`)
        const earlier = bill.payments
          .filter(
            (pay) =>
              pay.periodId === p?.id &&
              pay.status === 'completed' &&
              pay.paymentDate <= today &&
              pay.paymentDate.slice(0, 7) !== date.slice(0, 7),
          )
          .reduce((n, pay) => sumCents([n, paymentNetCents(pay, today)]), 0)
        if (earlier) credit(link, date, earlier)
        const key = bill.id + ':' + date.slice(0, 7),
          old = linkedBills.get(key)
        linkedBills.set(key, {
          debtId: link,
          date: old && old.date < date ? old.date : date,
          amount:
            row.amountCents === null || old?.amount === null
              ? null
              : sumCents([old?.amount ?? 0, Math.max(0, row.amountCents - (p?.creditCents ?? 0))]),
          name: row.name,
        })
        continue
      }
      const future = bill.payments.filter(
        (pay) =>
          pay.periodId === p?.id &&
          (['scheduled', 'pending'].includes(pay.status) ||
            (v.smart && pay.status === 'completed' && pay.paymentDate > today)) &&
          inside(plannedDate(pay.paymentDate)) &&
          !pay.debtPaymentId,
      )
      for (const pay of future)
        add({
          id: 'planned-bill:' + pay.id,
          date: plannedDate(pay.paymentDate),
          originalDate: pay.paymentDate,
          name: row.name + ' (' + pay.status + ')',
          amountCents: pay.method === 'credit_card' ? 0 : pay.amountCents,
          spendingCents: pay.amountCents,
          direction: 'out',
          kind: pay.status === 'pending' ? 'pending' : 'scheduled',
          estimated: true,
        })
      if (v.smart && future.some((pay) => pay.paymentDate < v.startDate))
        warnings.push(`Outstanding payment timing requires confirmation: ${row.name}`)
      const covered = sumCents([
        p?.paidCents ?? 0,
        p?.creditCents ?? 0,
        ...future.map((pay) => pay.amountCents),
      ])
      const remaining = row.amountCents === null ? null : Math.max(0, row.amountCents - covered)
      if (remaining !== 0)
        add({
          id: 'obligation:' + bill.id + ':' + row.dueDate,
          date,
          originalDate: row.dueDate,
          name: row.name + (row.dueDate < date ? ' (overdue)' : ''),
          amountCents: remaining,
          spendingCents: remaining ?? 0,
          direction: 'out',
          kind: 'bill',
          estimated: true,
        })
    }
  }
  for (const b of linkedBills.values()) requireDebt(b.debtId, b.date, b.amount, b.name)
  if (v.includeSettlements)
    for (const offer of s.offers.filter((o) => o.status === 'accepted'))
      for (const item of offer.schedule) {
        if (plannerCovered(offer.debtId, item.dueDate < v.startDate ? v.startDate : item.dueDate))
          continue
        const p = s.payments.find((p) => p.id === item.paymentId)
        const paid =
          p?.paymentStatus === 'completed' && p.paymentDate <= today ? paymentNetCents(p, today) : 0
        if (p && ['scheduled', 'pending'].includes(p.paymentStatus)) continue
        const remaining = Math.max(0, item.amountCents - paid)
        if (remaining === 0) continue
        const date = item.dueDate < v.startDate ? v.startDate : item.dueDate
        if (inside(date)) {
          add({
            id: 'settlement:' + item.id,
            date,
            name: offer.creditor + ' settlement',
            amountCents: remaining,
            direction: 'out',
            kind: 'settlement',
            estimated: true,
          })
          credit(offer.debtId, date, remaining)
        }
      }
  for (const [key, c] of commitments) {
    const remaining = c.amount === null ? null : Math.max(0, c.amount - (planned.get(key) ?? 0))
    if (remaining !== 0)
      add({
        id: 'debt-obligation:' + key,
        date: c.date,
        name: c.name + ' obligation',
        amountCents: remaining,
        direction: 'out',
        kind: 'debt_repayment',
        estimated: true,
      })
  }
}
