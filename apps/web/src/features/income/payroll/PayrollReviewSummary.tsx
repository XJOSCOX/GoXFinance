import { payrollStatementHours, type PayrollStatement } from '@goxfinance/shared'
import { formatMoney } from '../../../lib/money'
export function PayrollReviewSummary({ statement: s }: { statement: PayrollStatement }) {
  const hours = payrollStatementHours(s),
    display = (n: number | null) => (n === null ? 'Unknown' : n / 100)
  return (
    <>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 p-3 text-sm">
        <p>
          Work period{' '}
          <strong className="block">
            {s.periodStart ?? 'Missing'} — {s.periodEnd ?? 'Missing'}
          </strong>
        </p>
        <p>
          Statement pay date <strong className="block">{s.payDate ?? 'Missing'}</strong>
        </p>
        <p>
          Worked / paid hours{' '}
          <strong className="block">
            {display(hours.workedHundredths)} / {display(hours.paidHundredths)}
          </strong>
        </p>
        <p>
          Gross / net{' '}
          <strong className="block">
            {formatMoney(s.grossCents)} / {formatMoney(s.netCents)}
          </strong>
        </p>
      </div>
      <div className="space-y-2 text-xs">
        {(['earnings', 'deduction', 'employer_tax'] as const).map((side) => {
          const lines = s.lines.filter((l) => l.side === side)
          return lines.length ? (
            <div key={side}>
              <h3 className="font-semibold capitalize">
                {side === 'deduction' ? 'Taxes & other deductions' : side.replaceAll('_', ' ')}
              </h3>
              {lines.map((l, i) => (
                <p key={i} className="flex justify-between gap-2">
                  <span>
                    {l.label}
                    {l.confidence === 'low' ? ' · Check extraction' : ''}
                  </span>
                  <span>{formatMoney(l.currentCents)}</span>
                </p>
              ))}
            </div>
          ) : null
        })}
      </div>
    </>
  )
}
