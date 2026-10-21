import type { IncomeTransaction, IncomeSource } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { ActionMenu, type MenuAction } from '../../../components/ui/ActionMenu'
import { incomeDisplayDate, incomeDisplayPeriod } from './income-display'
import { incomeHistoryDate } from './income-history'
import { formatMoney } from '../../../lib/money'
export function IncomeHistory({
  transactions,
  sources,
  edit,
  view,
  details,
}: {
  transactions: IncomeTransaction[]
  sources: IncomeSource[]
  view: (v: IncomeTransaction) => void
  edit: (v: IncomeTransaction) => void
  details: (v: IncomeSource) => void
}) {
  if (!transactions.length)
    return <Card className="p-8 text-sm text-slate-400">No paychecks match this selection.</Card>
  return (
    <Card>
      <ul className="divide-y divide-white/8">
        {[...transactions]
          .sort(
            (a, b) =>
              incomeHistoryDate(b).localeCompare(incomeHistoryDate(a)) ||
              b.payDate.localeCompare(a.payDate),
          )
          .map((t) => {
            const source = sources.find((s) => s.id === t.sourceId),
              confirmed = t.status === 'confirmed',
              documented = t.actualNetCents !== null,
              items: MenuAction[] = [{ label: 'View paycheck', onSelect: () => view(t) }]
            if (source)
              items.push({ label: 'Source details & audit', onSelect: () => details(source) })
            if (t.canManage)
              items.push({
                label:
                  t.status === 'pending' || t.status === 'expected'
                    ? 'Confirm / correct'
                    : 'Correct / cancel',
                onSelect: () => edit(t),
              })
            return (
              <li key={t.id} className="flex items-start gap-3 p-4 sm:items-center sm:p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="truncate text-sm font-semibold">{source?.name ?? 'Income'}</h2>
                    <span
                      className={`text-[11px] capitalize ${confirmed ? 'text-emerald-300' : t.status === 'cancelled' ? 'text-slate-500' : 'text-amber-200'}`}
                    >
                      {t.status === 'confirmed' ? 'Received' : t.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Pay date {incomeDisplayDate(t.payDate)}
                    {t.depositDate && t.depositDate !== t.payDate
                      ? ' / Deposited ' + incomeDisplayDate(t.depositDate)
                      : ''}
                  </p>
                  {t.workPeriodStart && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {incomeDisplayPeriod(t.workPeriodStart, t.workPeriodEnd)}
                    </p>
                  )}
                </div>
                <dl className="hidden gap-6 text-right text-sm sm:flex">
                  <div>
                    <dt className="text-[11px] text-slate-500">Gross</dt>
                    <dd className="mt-1 tabular-nums">{formatMoney(t.actualGrossCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Deductions</dt>
                    <dd className="mt-1 tabular-nums">{formatMoney(t.deductionsCents)}</dd>
                  </div>
                </dl>
                <div className="min-w-24 text-right">
                  <p className="text-[11px] text-slate-500">
                    {confirmed ? 'Net received' : documented ? 'Documented net' : 'Expected net'}
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold tabular-nums ${confirmed ? 'text-emerald-300' : ''}`}
                  >
                    {formatMoney(confirmed || documented ? t.actualNetCents : t.expectedNetCents)}
                  </p>
                </div>
                <ActionMenu label={'Actions for paycheck ' + t.payDate} items={items} />
              </li>
            )
          })}
      </ul>
    </Card>
  )
}
