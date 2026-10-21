import type { InsightRef, InsightSources, InsightSink } from './insights'
import { budgetSpending } from './budget-calculations'
import {
  median,
  normalizeMerchant,
  roundedRatio,
  insightPeriods,
  dayOffset,
} from './insight-statistics'
import { sumCents } from './outflows'
import { plannerPatterns } from './planner-patterns'

export function spendingEvidence(
  s: InsightSources,
  from: string,
  through: string,
  categoryId?: string,
) {
  const expenses = s.expenses.filter(
    (e) =>
      !e.voided &&
      e.transactionDate >= from &&
      e.transactionDate <= through &&
      (!categoryId || e.allocations.some((a) => a.categoryId === categoryId)),
  )
  const bills = s.bills.flatMap((b) =>
    b.payments
      .filter(
        (p) =>
          p.status === 'completed' &&
          p.paymentDate >= from &&
          p.paymentDate <= through &&
          !p.debtPaymentId &&
          !p.debtId &&
          !(b.periods.find((r) => r.id === p.periodId)?.linkedDebtId ?? b.linkedDebtId) &&
          (!categoryId || b.periods.find((r) => r.id === p.periodId)?.categoryId === categoryId),
      )
      .map((p) => ({ b, p })),
  )
  const refunds = (s.refunds ?? []).filter(
    (r) =>
      r.status === 'completed' &&
      !r.debtPaymentId &&
      r.date >= from &&
      r.date <= through &&
      (!categoryId || r.allocations.some((a) => a.categoryId === categoryId)),
  )
  const refs: InsightRef[] = [
    ...refunds.map((r) => ({ type: 'refund' as const, id: r.id, date: r.date })),
    ...expenses.map((e) => ({ type: 'expense' as const, id: e.id, date: e.transactionDate })),
    ...bills.map(({ b, p }) => ({ type: 'bill' as const, id: b.id, date: p.paymentDate })),
  ]
  const spend = budgetSpending(
    expenses,
    s.bills.map((b) => ({ ...b, payments: b.payments.filter((p) => p.paymentDate >= from) })),
    from.slice(0, 7),
    null,
    through,
    refunds,
  )
  // Analysis windows are within one calendar month.
  const cents = sumCents(
    spend.filter((r) => !categoryId || r.categoryId === categoryId).map((r) => r.actualCents),
  )
  return { cents: refs.length ? cents : null, refs, count: refs.length }
}
export function spendingInsights(s: InsightSources, today: string, emit: InsightSink) {
  const window = insightPeriods(today),
    base = {
      ...window,
      impactCents: null,
      confidence: 'medium' as const,
      action: 'Review the linked records and configured category budget.',
      tradeoffs: ['Keep essential needs and verified payment commitments protected.'],
      limitations: [
        'Recorded purchases only; missing uploads are not zero spending.',
        'Equal day-of-month windows; reporting coverage may still differ.',
      ],
      module: 'expenses',
    }
  for (const category of s.categories) {
    const current = spendingEvidence(s, window.from, window.through, category.id),
      prior = spendingEvidence(s, window.comparisonFrom, window.comparisonThrough, category.id)
    const change =
      current.cents !== null && prior.cents !== null && prior.cents > 0
        ? roundedRatio(sumCents([current.cents, -prior.cents]), prior.cents, 10000)
        : null
    if (change !== null && Math.abs(change) >= 1000 && current.count >= 2 && prior.count >= 2)
      emit({
        ...base,
        id: `spending-trend:${category.id}:${today.slice(0, 7)}`,
        type: 'category_trend',
        area: 'spending',
        title: `${category.name}: recorded spending ${change > 0 ? 'increased' : 'decreased'}`,
        explanation:
          'Compare recorded category purchase spending in equivalent dated windows, net of completed refunds; repayments and transfers are excluded.',
        priority: change > 0 ? 'improvement' : 'informational',
        currentCents: current.cents,
        comparisonCents: prior.cents,
        changeBps: change,
        categoryId: category.id,
        refs: [...current.refs, ...prior.refs],
        sampleCount: current.count + prior.count,
        method: '(current − comparison) / comparison, rounded to basis points',
      })
    const budgetActual = spendingEvidence(s, window.from, today, category.id)
    const budget = (s.budgets ?? []).find(
        (b) =>
          b.status === 'active' && b.responsibleMemberId === null && b.month === today.slice(0, 7),
      ),
      limit = budget?.limits.find((l) => l.categoryId === category.id)?.amountCents
    if (limit !== undefined && budgetActual.cents !== null && budgetActual.cents > limit)
      emit({
        ...base,
        through: today,
        id: `budget-over:${category.id}:${today.slice(0, 7)}`,
        type: 'budget_over',
        area: 'spending',
        title: `${category.name} exceeds its configured budget`,
        explanation:
          'Actual recorded purchase spending exceeds the full monthly category limit. This is not a bank balance.',
        priority: 'important',
        currentCents: budgetActual.cents,
        comparisonCents: limit,
        changeBps: roundedRatio(budgetActual.cents, limit, 10000),
        categoryId: category.id,
        refs: [
          ...budgetActual.refs,
          { type: 'budget', id: budget!.id, date: budget!.month + '-01' },
        ],
        sampleCount: budgetActual.count,
        method: 'Recorded purchases net of refunds compared with saved category limit',
      })
    if (
      limit !== undefined &&
      budgetActual.cents !== null &&
      /dining|entertain|shopping|subscription|travel/i.test(category.name) &&
      !s.bills.some((b) => b.categoryId === category.id) &&
      !s.expenses.some(
        (e) =>
          !e.voided &&
          e.transactionDate > today &&
          e.allocations.some((a) => a.categoryId === category.id),
      )
    ) {
      const used = budgetActual.cents!,
        remaining = Math.max(0, sumCents([limit, -used]))
      if (remaining > 0)
        emit({
          ...base,
          through: today,
          id: `budget-review:${category.id}:${today.slice(0, 7)}`,
          type: 'budget_review',
          area: 'spending',
          title: `Review remaining ${category.name} allowance`,
          explanation:
            'Choose an optional reduction to this unspent budget allowance, then compare explicit planning scenarios. Missing spending coverage can make this allowance optimistic.',
          priority: 'improvement',
          currentCents: budgetActual.cents,
          comparisonCents: limit,
          changeBps: null,
          categoryId: category.id,
          reducibleCents: remaining,
          refs: [
            ...budgetActual.refs,
            { type: 'budget', id: budget!.id, date: budget!.month + '-01' },
          ],
          sampleCount: budgetActual.count,
          method:
            'Maximum scenario allowance = max(0, category limit − recorded spending); bill-covered categories and future recorded expenses excluded',
          module: 'budgets',
        })
    }
  }
  // Three complete recorded months with saved limits; absent months are not zero.
  for (const category of s.categories) {
    const months = [1, 2, 3].map((n) =>
      new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - n, 1))
        .toISOString()
        .slice(0, 7),
    )
    const observations = months.map((month) => {
      const end = dayOffset(
        new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1))
          .toISOString()
          .slice(0, 10),
        -1,
      )
      const b = (s.budgets ?? []).find(
          (b) => b.month === month && b.status === 'active' && b.responsibleMemberId === null,
        ),
        limit = b?.limits.find((l) => l.categoryId === category.id)?.amountCents,
        actual = spendingEvidence(s, month + '-01', end, category.id)
      return { b, limit, actual }
    })
    if (
      observations.every(
        (o) =>
          o.limit !== undefined &&
          o.actual.cents !== null &&
          o.actual.count >= 2 &&
          o.actual.cents > o.limit!,
      )
    )
      emit({
        ...base,
        id: `consistent-budget:${category.id}:${today.slice(0, 7)}`,
        type: 'consistent_budget_over',
        area: 'spending',
        title: `${category.name}: three recorded months above budget`,
        explanation:
          'All three preceding complete months have at least two observations and exceeded their own configured monthly limit. Reporting coverage may differ; no missing month is treated as zero.',
        priority: 'important',
        from: months[2] + '-01',
        through: dayOffset(window.from, -1),
        currentCents: sumCents(observations.map((o) => o.actual.cents!)),
        comparisonCents: sumCents(observations.map((o) => o.limit!)),
        changeBps: null,
        categoryId: category.id,
        sampleCount: observations.reduce((n, o) => n + o.actual.count, 0),
        refs: observations.flatMap((o) => [
          ...o.actual.refs,
          { type: 'budget' as const, id: o.b!.id, date: o.b!.month + '-01' },
        ]),
        method:
          'Three distinct completed calendar months: net actual category purchases > saved limit in each',
      })
  }
  for (const bill of s.bills) {
    const periods = bill.periods
      .filter(
        (p) =>
          p.dueDate < today &&
          p.amountCents !== null &&
          ['paid', 'overpaid', 'credited'].includes(p.paymentStatus),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const patterns = plannerPatterns(
      {
        ...s,
        bills: [bill],
        categories: [],
        income: { sources: [], transactions: [], canCreate: false },
        planner: undefined,
      },
      today,
    )
    for (const pattern of patterns.filter(
      (p) =>
        p.name.endsWith('completed bill average') ||
        p.name.endsWith('recent change') ||
        p.name.endsWith('same-month history'),
    )) {
      emit({
        ...base,
        id: `bill-pattern:${bill.id}:${pattern.name.slice(bill.name.length).trim().replaceAll(' ', '-')}`,
        type: 'bill_pattern',
        area: 'spending',
        title: pattern.name,
        explanation: pattern.basis,
        priority: 'informational',
        confidence: pattern.confidence,
        from: periods[0]?.dueDate ?? today,
        through: periods.at(-1)?.dueDate ?? today,
        sampleCount: pattern.sampleCount,
        currentCents: pattern.amountCents,
        comparisonCents: null,
        changeBps: null,
        refs: [{ type: 'bill', id: bill.id, date: periods.at(-1)?.dueDate ?? today }],
        method:
          'Existing Smart Planner completed-bill pattern calculation. Seasonal comparisons require at least 24 completed periods and matching months across at least two years.',
        module: 'bills',
      })
    }
  }
  const recurringProviders: { merchant: string; categoryId: string; refs: InsightRef[] }[] = []
  const rows = s.expenses.filter(
    (e) => !e.voided && e.transactionDate <= today && e.transactionDate >= dayOffset(today, -1120),
  )
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = normalizeMerchant(row.merchant ?? row.description)
    if (key) groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const [merchant, unsorted] of groups) {
    const records = [...unsorted].sort(
        (a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id),
      ),
      latest = records.at(-1)!
    if (latest.transactionDate < dayOffset(today, -380)) continue
    const refs: InsightRef[] = records.map((e) => ({
      type: 'expense',
      id: e.id,
      date: e.transactionDate,
    }))
    const sameDay = records.filter(
      (e) => e.transactionDate === latest.transactionDate && e.amountCents === latest.amountCents,
    )
    const common = {
      ...base,
      from: records[0].transactionDate,
      through: latest.transactionDate,
      categoryId: latest.allocations.length === 1 ? latest.allocations[0].categoryId : undefined,
      refs,
      sampleCount: records.length,
      currentCents: latest.amountCents,
      comparisonCents: records.at(-2)?.amountCents ?? null,
      changeBps: null,
    }
    if (sameDay.length > 1 && latest.transactionDate >= dayOffset(today, -45))
      emit({
        ...common,
        sampleCount: sameDay.length,
        refs: sameDay.map((e) => ({ type: 'expense', id: e.id, date: e.transactionDate })),
        from: latest.transactionDate,
        through: latest.transactionDate,
        id: `duplicate-review:${latest.id}`,
        type: 'duplicate_review',
        area: 'spending',
        title: 'Similar same-day charges need review',
        explanation:
          'The normalized merchant, date and amount match. These may be legitimate separate purchases; no record has been removed.',
        priority: 'important',
        confidence: 'low',
        method: 'Same normalized merchant/date/amount; review only',
      })
    const uniqueDates = [...new Map(records.map((r) => [r.transactionDate, r])).values()],
      gaps = uniqueDates
        .slice(1)
        .map(
          (r, i) =>
            (Date.parse(r.transactionDate) - Date.parse(uniqueDates[i].transactionDate)) / 86400000,
        ),
      typical = median(gaps)
    const cadence =
      typical !== null && Math.abs(typical - 7) <= 2
        ? 'weekly'
        : typical !== null && typical >= 26 && typical <= 35
          ? 'monthly'
          : typical !== null && typical >= 350 && typical <= 380
            ? 'annual'
            : null
    if (
      cadence &&
      (cadence === 'annual' || latest.transactionDate >= dayOffset(today, -45)) &&
      gaps.length >= 2 &&
      gaps.every(
        (g) =>
          Math.abs(g - typical!) <= (cadence === 'weekly' ? 2 : cadence === 'monthly' ? 4 : 15),
      )
    ) {
      if (latest.allocations.length === 1)
        recurringProviders.push({ merchant, categoryId: latest.allocations[0].categoryId, refs })
      const linked = s.bills.find(
        (b) => b.status === 'active' && normalizeMerchant(b.name) === merchant,
      )
      emit({
        ...common,
        id: `recurring:${merchant}`,
        sampleCount: uniqueDates.length,
        type: 'recurring',
        area: 'spending',
        title: `Potential ${cadence} recurring charge`,
        explanation: linked
          ? `A matching bill already exists: ${linked.name}. Review its actual charges; do not create a duplicate bill.`
          : 'Repeated merchant charges follow a consistent interval. Their purpose and any cancellation terms are unknown.',
        priority: 'informational',
        method:
          'At least three distinct dated purchases with consistent intervals; duplicate same-day rows do not strengthen evidence',
        refs: linked ? [...refs, { type: 'bill', id: linked.id, date: linked.nextDueDate }] : refs,
        module: linked ? 'bills' : 'expenses',
        action: linked
          ? 'Review the existing bill.'
          : 'Review the provider and optionally link an existing bill; no subscription is created or cancelled.',
      })
      const amounts = uniqueDates.map((r) => r.amountCents)
      if (
        amounts.length >= 3 &&
        amounts.slice(1).every((v, i) => v >= amounts[i]) &&
        amounts.at(-1)! > amounts[0]
      )
        emit({
          ...common,
          id: `recurring-price:${merchant}`,
          sampleCount: uniqueDates.length,
          type: 'price_increase',
          area: 'spending',
          priority: 'improvement',
          title: 'Recurring recorded charge increased',
          explanation:
            'Amounts increased across the observed recurrence. Verify changes in quantity, service or fees before interpreting this as a price increase.',
          method: 'Nondecreasing amounts over at least three distinct recurring dates',
          comparisonCents: amounts[0],
          changeBps: roundedRatio(amounts.at(-1)! - amounts[0], amounts[0], 10000),
        })
    }
    const previous = records.slice(0, -1),
      middle = median(previous.map((r) => r.amountCents))
    if (
      latest.transactionDate >= dayOffset(today, -45) &&
      previous.length >= 5 &&
      middle !== null &&
      BigInt(latest.amountCents) > BigInt(middle) * 2n
    )
      emit({
        ...common,
        id: `spike:${latest.id}`,
        type: 'spending_spike',
        area: 'spending',
        priority: 'important',
        confidence: 'low',
        title: 'Purchase above this merchant’s observed median',
        explanation:
          'The latest purchase exceeds twice the median of at least five earlier purchases. Quantity and purpose are unknown.',
        method: 'Latest amount > 2 × prior merchant median',
        comparisonCents: middle,
      })
  }
  for (const category of s.categories.filter((c) => /subscription|stream/i.test(c.name))) {
    const providers = recurringProviders.filter((p) => p.categoryId === category.id)
    if (providers.length < 2) continue
    emit({
      ...base,
      id: `similar-services:${category.id}`,
      type: 'similar_services_review',
      area: 'spending',
      title: `Review recurring providers in ${category.name}`,
      explanation:
        'At least two distinct providers have recurring charge patterns in this configured subscription category. Their purposes may differ; this does not establish a duplicate or unnecessary service.',
      priority: 'improvement',
      confidence: 'low',
      sampleCount: providers.length,
      currentCents: null,
      comparisonCents: null,
      changeBps: null,
      refs: providers.flatMap((p) => p.refs),
      categoryId: category.id,
      method:
        'Distinct normalized merchants with at least three recurring dated charges each, assigned to the same explicit subscription category',
      action:
        'Compare the services and their purposes before deciding whether any change is appropriate.',
    })
  }
}
