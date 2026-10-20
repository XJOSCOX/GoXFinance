import { budgetFromBills } from './budget-planning'
import { sumCents } from './outflows'
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
      credit(p.debtId, p.paymentDate, p.amountCents)
    if (
      (['scheduled', 'pending'].includes(p.paymentStatus) ||
        (p.paymentStatus === 'completed' && p.paymentDate > today)) &&
      inside(p.paymentDate)
    ) {
      add({
        id: 'planned-debt:' + p.id,
        date: p.paymentDate,
        name: 'Debt payment (' + p.paymentStatus + ')',
        amountCents: p.paymentMethod === 'credit_card' ? 0 : p.amountCents,
        direction: 'out',
        kind: p.paymentStatus === 'pending' ? 'pending' : 'scheduled',
        estimated: true,
      })
      credit(p.debtId, p.paymentDate, p.amountCents)
    }
  }
  for (const month of months)
    for (const group of debtGroups) {
      const d = representativeDebtBalance(group)
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
      if (!inside(date) || (d.nextDueDate && date < d.nextDueDate)) continue
      const amount = group.some((r) => r.minimumPaymentCents !== null)
        ? Math.max(...group.map((r) => r.minimumPaymentCents ?? 0))
        : null
      requireDebt(d.id, date, amount, d.accountNickname || d.creditorName)
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
        amountCents: p.amountCents ?? p.budgetEstimateCents ?? p.estimatedAmountCents,
        basis: 'Overdue',
        included: true,
      })
    for (const row of dates.values()) {
      const p = bill.periods.find((p) => p.dueDate === row.dueDate),
        date = row.dueDate < v.startDate ? v.startDate : row.dueDate,
        link = p ? p.linkedDebtId : bill.linkedDebtId
      if (!inside(date)) continue
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
          .reduce((n, pay) => sumCents([n, pay.amountCents]), 0)
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
          ['scheduled', 'pending'].includes(pay.status) &&
          inside(pay.paymentDate) &&
          !pay.debtPaymentId,
      )
      for (const pay of future)
        add({
          id: 'planned-bill:' + pay.id,
          date: pay.paymentDate,
          name: row.name + ' (' + pay.status + ')',
          amountCents: pay.method === 'credit_card' ? 0 : pay.amountCents,
          spendingCents: pay.amountCents,
          direction: 'out',
          kind: pay.status as 'scheduled' | 'pending',
          estimated: true,
        })
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
        const p = s.payments.find((p) => p.id === item.paymentId)
        if (p && ['completed', 'scheduled', 'pending'].includes(p.paymentStatus)) continue
        const date = item.dueDate < v.startDate ? v.startDate : item.dueDate
        if (inside(date)) {
          add({
            id: 'settlement:' + item.id,
            date,
            name: offer.creditor + ' settlement',
            amountCents: item.amountCents,
            direction: 'out',
            kind: 'settlement',
            estimated: true,
          })
          credit(offer.debtId, date, item.amountCents)
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
