import type { ForecastInput, PlannerReport } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { readMoney, text } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'
import { useState } from 'react'
import { errorMessage } from '../../../lib/api'
export function PlannerScenario({
  input,
  report,
  baseline,
  update,
}: {
  input: ForecastInput
  report: PlannerReport
  baseline: PlannerReport
  update: (v: ForecastInput) => void
}) {
  const [error, setError] = useState('')
  return (
    <details className="rounded-xl border border-white/10 p-4">
      <summary className="cursor-pointer font-semibold">
        Reserves, utilities & hypothetical advances
      </summary>
      <p className="my-3 text-xs text-slate-400">
        Explicit scenarios only. Borrowed cash is never earned income. No provider request or
        financial transaction is created.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          try {
            const f = new FormData(e.currentTarget),
              amount = readMoney(f, 'advance')
            const receivedDate = text(f, 'receivedDate'),
              repaymentDate = text(f, 'repaymentDate')
            if (amount !== null && repaymentDate < receivedDate)
              throw Error('Hypothetical repayment must follow receipt.')
            update({
              ...input,
              planning: {
                essentialReserveCents: readMoney(f, 'reserve', true)!,
                utilityIncreaseCents: readMoney(f, 'utility', true)!,
                hypotheticalAdvance:
                  amount === null
                    ? null
                    : {
                        amountCents: amount,
                        feesCents: readMoney(f, 'fees', true)!,
                        receivedDate,
                        repaymentDate,
                      },
              },
            })
            setError('')
          } catch (x) {
            setError(errorMessage(x))
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AmountField
            label="Additional food / transport reserve (USD)"
            name="reserve"
            value={input.planning?.essentialReserveCents ?? 0}
            required
          />
          <AmountField
            name="utility"
            label="Unexpected utility increase (USD)"
            value={input.planning?.utilityIncreaseCents ?? 0}
            required
          />
          <AmountField
            name="advance"
            label="Hypothetical advance received (USD)"
            value={input.planning?.hypotheticalAdvance?.amountCents}
          />
          <AmountField
            name="fees"
            label="Hypothetical advance fees (USD)"
            value={input.planning?.hypotheticalAdvance?.feesCents ?? 0}
            required
          />
          <DateField
            name="receivedDate"
            label="Hypothetical receipt date"
            value={input.planning?.hypotheticalAdvance?.receivedDate ?? input.startDate}
            required
          />
          <DateField
            name="repaymentDate"
            label="Hypothetical repayment date"
            value={input.planning?.hypotheticalAdvance?.repaymentDate ?? input.endDate}
            required
          />
        </div>
        <FormField label="Scenario name">
          <Input
            name="scenarioName"
            defaultValue={input.name}
            onChange={(e) => update({ ...input, name: e.target.value || 'Planning scenario' })}
          />
        </FormField>
        <Button type="submit">Compare scenario</Button>
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
      </form>
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <p>
          Lowest projected cash
          <br />
          <strong>
            {formatMoney(report.forecast.lowestCents)}{' '}
            <span className="text-slate-400">
              (base {formatMoney(baseline.forecast.lowestCents)})
            </span>
          </strong>
        </p>
        <p>
          Critical unfunded
          <br />
          <strong>{formatMoney(report.unfundedCriticalCents)}</strong>
        </p>
        <p>
          Ending projected cash
          <br />
          <strong>{formatMoney(report.forecast.endingCents)}</strong>
        </p>
        <p>
          Negative days
          <br />
          <strong>
            {report.forecast.days.filter((d) => (d.knownSubtotalCents ?? 0) < 0).length}
          </strong>
        </p>
        <p>
          Days below buffer
          <br />
          <strong>{report.forecast.smart?.daysBelowBuffer ?? 0}</strong>
        </p>
        <p>
          Disclosed advance / plan costs
          <br />
          <strong>{formatMoney(report.feesCents)}</strong>
        </p>
      </div>
    </details>
  )
}
