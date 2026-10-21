import { useState } from 'react'
import {
  forecastInputSchema,
  type ForecastInput,
  type ForecastReport,
  type ForecastSources,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, moneyText, text } from '../../../lib/financial-entry'
import { errorMessage } from '../../../lib/api'
import { formatMoney } from '../../../lib/money'

export function SmartWhatIf({
  input,
  baseline,
  report,
  sources,
  update,
  reset,
}: {
  input: ForecastInput
  baseline: ForecastReport
  report: ForecastReport
  sources: ForecastSources
  update: (v: ForecastInput) => void
  reset: () => void
}) {
  const [error, setError] = useState('')
  const paychecks = baseline.events.filter((e) => e.kind === 'expected_income' && e.estimated)
  const optional = baseline.events.filter(
    (e) => ['pending', 'scheduled', 'scenario'].includes(e.kind) && e.direction === 'out',
  )
  return (
    <details className="rounded-xl border border-white/10 bg-white/[.02] p-4">
      <summary className="cursor-pointer font-semibold">What-if planner</summary>
      <p className="mt-2 text-xs text-slate-400">
        Planning only. Original paychecks, bills and payment dates stay unchanged. These outcomes
        are assumptions, not probabilities.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          try {
            const f = new FormData(e.currentTarget),
              paycheck = text(f, 'paycheck'),
              postpone = text(f, 'postpone'),
              sourceId = text(f, 'source')
            const adjustment = paycheck
              ? [
                  {
                    eventId: paycheck,
                    delayDays: Number(text(f, 'delay')),
                    reductionBps: Number(text(f, 'reduce')) * 100,
                    excluded: f.has('exclude'),
                  },
                ]
              : []
            const scenario = text(f, 'itemName')
              ? [
                  {
                    id: crypto.randomUUID(),
                    name: text(f, 'itemName'),
                    date: text(f, 'itemDate'),
                    kind: text(f, 'itemKind'),
                    amountCents: readMoney(f, 'itemAmount', true),
                  },
                ]
              : []
            const net = sourceId ? readMoney(f, 'assumedNet', true) : null
            update(
              forecastInputSchema.parse({
                ...input,
                name: text(f, 'name'),
                variableSpendingCents: readMoney(f, 'spending', true),
                extraDebtCents: readMoney(f, 'extra', true),
                includeSettlements: f.has('settlements'),
                oneTime: [...input.oneTime, ...scenario],
                income: sourceId
                  ? [
                      ...input.income.filter((a) => a.sourceId !== sourceId),
                      {
                        sourceId,
                        firstPayDate: text(f, 'assumedDate'),
                        conservativeNetCents: net,
                        expectedNetCents: net,
                        optimisticNetCents: net,
                        regularHours: null,
                        overtimeHours: null,
                      },
                    ]
                  : input.income,
                smart: {
                  ...input.smart!,
                  bufferCents: readMoney(f, 'buffer', true),
                  incomeAdjustments: [
                    ...input.smart!.incomeAdjustments.filter((a) => a.eventId !== paycheck),
                    ...adjustment,
                  ],
                  postponedPayments: postpone
                    ? [
                        ...input.smart!.postponedPayments.filter((a) => a.eventId !== postpone),
                        { eventId: postpone, delayDays: Number(text(f, 'postponeDays')) },
                      ]
                    : input.smart!.postponedPayments,
                },
              }),
            )
            if (scenario.length) {
              const nameField = e.currentTarget.elements.namedItem('itemName') as HTMLInputElement
              const amountField = e.currentTarget.elements.namedItem(
                'itemAmount',
              ) as HTMLInputElement
              nameField.value = ''
              amountField.value = ''
            }
            setError('')
          } catch (failure) {
            setError(errorMessage(failure))
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Scenario name">
            <Input name="name" defaultValue={input.name} required maxLength={160} />
          </FormField>
          <FormField label="Scenario buffer (USD)">
            <Input
              name="buffer"
              defaultValue={moneyText(input.smart!.bufferCents)}
              required
              inputMode="decimal"
            />
          </FormField>
          <FormField label="Additional spending (range total, USD)">
            <Input
              name="spending"
              defaultValue={moneyText(input.variableSpendingCents)}
              required
              inputMode="decimal"
            />
          </FormField>
          <FormField label="Additional debt payment (USD)">
            <Input
              name="extra"
              defaultValue={moneyText(input.extraDebtCents)}
              required
              inputMode="decimal"
            />
          </FormField>
          <FormField label="Expected paycheck">
            <Select name="paycheck">
              <option value="">No paycheck adjustment</option>
              {paychecks.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.date} · {e.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Paycheck delay">
            <Select name="delay">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Smaller take-home">
            <Select name="reduce">
              {[0, 10, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input name="exclude" type="checkbox" />
            Exclude selected paycheck
          </label>
          <FormField label="Optional outgoing payment">
            <Select name="postpone">
              <option value="">No postponement</option>
              {optional.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.date} · {e.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Optional postponement">
            <Select name="postponeDays">
              {[1, 2, 3, 5, 7, 14, 30].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <p className="text-xs text-slate-500">
          Use postponement only for optional payments you can defer. A deferred payment can move
          outside this view; the original obligation is unchanged.
        </p>
        <fieldset className="grid gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="px-1 text-sm">Add an unexpected expense or additional income</legend>
          <FormField label="Scenario item name">
            <Input name="itemName" placeholder="e.g. fictional repair" maxLength={160} />
          </FormField>
          <FormField label="Scenario item type">
            <Select name="itemKind">
              <option value="expense">Expense</option>
              <option value="income">Additional income</option>
            </Select>
          </FormField>
          <FormField label="Scenario item date">
            <Input
              name="itemDate"
              type="date"
              defaultValue={input.startDate}
              min={input.startDate}
              max={input.endDate}
            />
          </FormField>
          <FormField label="Scenario item amount (USD)">
            <Input name="itemAmount" inputMode="decimal" placeholder="Amount in USD" />
          </FormField>
        </fieldset>
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-300">
            Approve an explicit future income assumption
          </summary>
          <p className="my-3 text-xs text-slate-400">
            Only add a net amount and date you explicitly approve. Known paychecks replace this
            assumption on matching dates. Weekly, biweekly and monthly patterns follow the source
            schedule; semimonthly and irregular sources use only the explicit date. No future hours
            are invented.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Assumed income source">
              <Select name="source">
                <option value="">No new source assumption</option>
                {sources.income.sources
                  .filter(
                    (s) =>
                      s.status === 'active' && !s.isArchived && s.incomeType !== 'trading_payout',
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.frequency}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="First assumed payday">
              <Input name="assumedDate" type="date" />
            </FormField>
            <FormField label="Assumed take-home (USD)">
              <Input
                name="assumedNet"
                inputMode="decimal"
                placeholder="Explicit net-pay assumption"
              />
            </FormField>
          </div>
        </details>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="settlements" defaultChecked={input.includeSettlements} />
          Include accepted settlement schedules
        </label>
        {(input.oneTime.length > 0 ||
          input.smart!.incomeAdjustments.length > 0 ||
          input.income.length > 0 ||
          input.smart!.postponedPayments.length > 0) && (
          <p className="text-xs text-slate-400">
            {input.oneTime.length} added items · {input.smart!.incomeAdjustments.length} paycheck
            adjustments · {input.income.length} income patterns ·{' '}
            {input.smart!.postponedPayments.length} postponed payments. Reset removes all scenario
            assumptions.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Apply simulation</Button>
          <Button type="button" onClick={reset}>
            Reset simulation
          </Button>
        </div>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="mb-2 text-left font-semibold">Baseline versus simulation</caption>
          <thead className="text-slate-400">
            <tr>
              <th className="p-2">Measure</th>
              <th className="p-2">Baseline</th>
              <th className="p-2">Simulation</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Lowest cash', formatMoney(baseline.lowestCents), formatMoney(report.lowestCents)],
              ['Ending cash', formatMoney(baseline.endingCents), formatMoney(report.endingCents)],
              [
                'Days below buffer',
                baseline.smart?.openingRequired
                  ? 'Unknown'
                  : String(baseline.smart?.daysBelowBuffer ?? 0),
                report.smart?.openingRequired
                  ? 'Unknown'
                  : String(report.smart?.daysBelowBuffer ?? 0),
              ],
              [
                'First potential shortfall',
                baseline.shortfalls[0]
                  ? `${baseline.shortfalls[0].date} · ${formatMoney(baseline.shortfalls[0].amountCents)}`
                  : baseline.incomplete
                    ? 'Incomplete'
                    : 'None',
                report.shortfalls[0]
                  ? `${report.shortfalls[0].date} · ${formatMoney(report.shortfalls[0].amountCents)}`
                  : report.incomplete
                    ? 'Incomplete'
                    : 'None',
              ],
            ].map(([name, a, b]) => (
              <tr key={name} className="border-t border-white/10">
                <th className="p-2 font-normal">{name}</th>
                <td className="p-2">{a}</td>
                <td className="p-2">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
