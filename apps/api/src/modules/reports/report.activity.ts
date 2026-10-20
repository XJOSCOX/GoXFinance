import {
  cashOutflows,
  sumCents,
  incomeSummary,
  billPeriodView,
  budgetSpending,
  budgetCategoryRows,
  type ReportFilters,
} from '@goxfinance/shared'
import type { ReportSources } from './report.sources'
import { table, inRange, months } from './report.tables'
export function activityTables(s: ReportSources, f: ReportFilters, today: string) {
  const expenses = s.expenses
    .filter((e) => !f.categoryId || e.allocations.some((a) => a.categoryId === f.categoryId))
    .map((e) =>
      !f.categoryId
        ? e
        : {
            ...e,
            allocations: e.allocations.filter((a) => a.categoryId === f.categoryId),
            amountCents: sumCents(
              e.allocations.filter((a) => a.categoryId === f.categoryId).map((a) => a.amountCents),
            ),
          },
    )
  const bills = s.bills.map((b) => ({
    ...b,
    payments: b.payments.filter(
      (p) =>
        !f.categoryId ||
        b.periods.find((period) => period.id === p.periodId)?.categoryId === f.categoryId,
    ),
  }))
  const payments = s.payments.filter(
    (p) => !f.categoryId || s.debts.find((d) => d.id === p.debtId)?.categoryId === f.categoryId,
  )
  const outflows = cashOutflows(
    expenses,
    bills.flatMap((b) => b.payments),
    payments,
    today,
  ).filter((r) => inRange(r.date, f.from, f.to))
  const income = s.income.transactions.filter((t) =>
    inRange(t.status === 'confirmed' ? t.depositDate : t.payDate, f.from, f.to),
  )
  const totals = months(f.from, f.to).map((month) => {
    const inc = incomeSummary(
        income.filter((t) =>
          (t.status === 'confirmed' ? t.depositDate : t.payDate)?.startsWith(month),
        ),
        month,
        today,
      ),
      out = outflows.filter((o) => o.date.startsWith(month))
    return {
      month,
      confirmedIncomeCents: inc.confirmedCents,
      pendingIncomeCents: inc.pendingCents,
      expectedIncomeCents: inc.expectedCents,
      unknownPending: inc.pendingUnknownCount,
      unknownExpected: inc.expectedUnknownCount,
      purchaseSpendingCents: sumCents(out.map((o) => o.spendingCents)),
      cashOutflowCents: sumCents(out.map((o) => o.cashOutflowCents)),
      debtRepaymentCents: sumCents(
        out.filter((o) => o.source === 'debt').map((o) => o.cashOutflowCents),
      ),
      netRecordedCashFlowCents: sumCents([
        inc.confirmedCents,
        -sumCents(out.map((o) => o.cashOutflowCents)),
      ]),
    }
  })
  const budgetRows = s.budgets
    .filter(
      (b) => b.status === 'active' && b.month >= f.from.slice(0, 7) && b.month <= f.to.slice(0, 7),
    )
    .flatMap((b) =>
      budgetCategoryRows(
        b,
        s.categories.map((c) => ({
          ...c,
          usage: { bills: 0, billPeriods: 0, debts: 0, expenses: 0 },
        })),
        budgetSpending(
          expenses.filter((e) => inRange(e.transactionDate, f.from, f.to)),
          bills.map((b) => ({
            ...b,
            payments: b.payments.filter((p) => inRange(p.paymentDate, f.from, f.to)),
          })),
          b.month,
          b.responsibleMemberId,
          today,
        ),
      )
        .filter((r) => !f.categoryId || r.categoryId === f.categoryId)
        .map((r) => ({
          budgetId: b.id,
          month: b.month,
          category: r.name,
          monthlyAllocationCents: b.totalCents,
          categoryLimitCents: r.limitCents,
          actualPurchaseCents: r.actualCents,
          remainingCents: r.remainingCents,
          overCents: r.overCents,
          status: r.status,
          sourceUpdatedAt: b.updatedAt,
        })),
    )
  return {
    income_spending: [
      table(
        'Monthly income and spending',
        'Selected dates only. Confirmed deposits and completed outflows; credit purchases remain spending.',
        totals,
      ),
      table(
        'Annual income and spending',
        'Selected portion of each year. Summed authoritative monthly totals.',
        [...new Set(totals.map((t) => t.month.slice(0, 4)))].map((year) => ({
          year,
          ...Object.fromEntries(
            [
              'confirmedIncomeCents',
              'pendingIncomeCents',
              'expectedIncomeCents',
              'purchaseSpendingCents',
              'cashOutflowCents',
              'debtRepaymentCents',
              'netRecordedCashFlowCents',
            ].map((key) => [
              key,
              sumCents(
                totals
                  .filter((t) => t.month.startsWith(year))
                  .map((t) => t[key as keyof typeof t] as number),
              ),
            ]),
          ),
        })),
      ),
      table(
        'Income records',
        'Actual gross and net are separate. Expected amounts do not represent deposits.',
        income.map((t) => ({
          id: t.id,
          source: s.income.sources.find((i) => i.id === t.sourceId)?.name ?? 'Income',
          memberId: t.responsibleMemberId,
          status: t.status,
          payDate: t.payDate,
          depositDate: t.depositDate,
          grossCents: t.actualGrossCents,
          netCents: t.actualNetCents,
          expectedNetCents: t.expectedNetCents,
          confirmedAt: t.confirmedAt,
          sourceUpdatedAt: t.updatedAt,
        })),
      ),
      table(
        'Purchase spending by category',
        'Completed purchase allocations within selected dates, including credit purchases; no debt repayments.',
        months(f.from, f.to).flatMap((month) =>
          budgetSpending(
            expenses.filter((e) => inRange(e.transactionDate, f.from, f.to)),
            bills.map((b) => ({
              ...b,
              payments: b.payments.filter((p) => inRange(p.paymentDate, f.from, f.to)),
            })),
            month,
            null,
            today,
          ).map((row) => ({
            month,
            category: s.categories.find((c) => c.id === row.categoryId)?.name ?? 'Uncategorized',
            actualCents: row.actualCents,
          })),
        ),
      ),
    ],
    cash_flow: [
      table(
        'Cash flow history',
        'Confirmed deposits minus completed cash outflows; not a bank balance. Expected and pending amounts do not enter the net.',
        totals.map((t) => ({
          month: t.month,
          confirmedIncomeCents: t.confirmedIncomeCents,
          cashOutflowCents: t.cashOutflowCents,
          netRecordedCashFlowCents: t.netRecordedCashFlowCents,
        })),
      ),
      table(
        'Confirmed cash inflows',
        'Existing confirmed Income only, including actual withdrawn payout deposits once.',
        income
          .filter((t) => t.status === 'confirmed' && t.depositDate && t.depositDate <= today)
          .map((t) => ({
            id: t.id,
            date: t.depositDate,
            netCents: t.actualNetCents,
            type: t.incomeTypeSnapshot,
            sourceUpdatedAt: t.updatedAt,
          })),
      ),
      table(
        'Bill obligations',
        'Current corrected billed amounts and recorded credits, with completed payments through report end. Estimates are separate from actual amounts owed.',
        bills.flatMap((b) =>
          b.periods
            .filter(
              (p) =>
                inRange(p.dueDate, f.from, f.to) &&
                (!f.categoryId || p.categoryId === f.categoryId),
            )
            .map((p) => {
              const v = billPeriodView(
                p,
                b.payments,
                p.paymentStatus === 'cancelled',
                f.to < today ? f.to : today,
              )
              return {
                id: p.id,
                billId: b.id,
                name: p.name,
                dueDate: p.dueDate,
                estimateCents: p.budgetEstimateCents ?? p.estimatedAmountCents,
                billedCents: p.amountCents,
                creditCents: p.creditCents,
                paidCents: v.paidCents,
                remainingCents: v.remainingCents,
                overpaidCents: v.overpaidCents,
                paymentStatus: v.paymentStatus,
                sourceUpdatedAt: p.updatedAt,
              }
            }),
        ),
      ),
      table(
        'Cash outflow history',
        'Completed only. Debt-linked bill aliases excluded; debt repayment is not a second purchase.',
        outflows.map((o) => ({ ...o })),
      ),
    ],
    budgets: [
      table(
        'Category budgets versus actual',
        'Full-month limits versus spending within selected dates; category rows do not add to the monthly allocation.',
        budgetRows,
      ),
    ],
  }
}
