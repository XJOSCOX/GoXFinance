import { PayoffAssumptions } from './PayoffAssumptions'
import { useMemo, useState } from 'react'
import {
  payoffScenarioSchema,
  payoffInputs,
  simulatePayoff,
  localBillDate,
  type Debt,
  type PayoffScenarioInput,
} from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'
import { errorMessage } from '../../../lib/api'
const names = {
  snowball: 'Snowball',
  avalanche: 'Avalanche',
  custom: 'Custom priority',
  minimums: 'Minimums only',
} as const
export function PayoffPlanner({
  debts,
  initial,
  save,
}: {
  debts: Debt[]
  initial?: PayoffScenarioInput
  save?: (input: PayoffScenarioInput) => Promise<void>
}) {
  const [input, setInput] = useState<PayoffScenarioInput>(
      initial ?? {
        name: 'Debt payoff plan',
        startDate: localBillDate(),
        strategy: 'snowball',
        extraCents: 0,
        availableCents: null,
        order: [],
        assumptions: [],
      },
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const results = useMemo(() => {
    try {
      return {
        report: simulatePayoff(debts, input),
        baseline: simulatePayoff(debts, { ...input, strategy: 'minimums', extraCents: 0 }),
        snowball: simulatePayoff(debts, { ...input, strategy: 'snowball' }),
        avalanche: simulatePayoff(debts, { ...input, strategy: 'avalanche' }),
      }
    } catch (e) {
      return { error: errorMessage(e) }
    }
  }, [debts, input])
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              const f = new FormData(e.currentTarget)
              setInput(
                payoffScenarioSchema.parse({
                  name: text(f, 'name'),
                  startDate: text(f, 'startDate'),
                  strategy: text(f, 'strategy'),
                  extraCents: readMoney(f, 'extra', true),
                  availableCents: readMoney(f, 'available'),
                  order: input.order,
                  assumptions: payoffInputs(debts, input)
                    .map((d) => ({
                      debtId: d.id,
                      ...(text(f, d.id + ':balance')
                        ? { balanceCents: readMoney(f, d.id + ':balance', true) }
                        : {}),
                      ...(text(f, d.id + ':min')
                        ? { minimumCents: readMoney(f, d.id + ':min', true) }
                        : {}),
                      ...(text(f, d.id + ':apr') ? { apr: text(f, d.id + ':apr') } : {}),
                    }))
                    .filter((a) => Object.keys(a).length > 1),
                }),
              )
              setError('')
            } catch (err) {
              setError(errorMessage(err))
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Scenario name">
              <Input name="name" defaultValue={input.name} required />
            </FormField>
            <FormField label="Start date">
              <Input name="startDate" type="date" defaultValue={input.startDate} required />
            </FormField>
            <FormField label="Strategy">
              <Select name="strategy" defaultValue={input.strategy}>
                {Object.entries(names).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Extra monthly payment ($)">
              <Input
                name="extra"
                inputMode="decimal"
                defaultValue={(input.extraCents / 100).toFixed(2)}
                required
              />
            </FormField>
            <FormField label="Available monthly planning funds ($)">
              <Input
                name="available"
                inputMode="decimal"
                defaultValue={
                  input.availableCents === null ? '' : (input.availableCents / 100).toFixed(2)
                }
                placeholder="Unknown"
              />
            </FormField>
          </div>
          <PayoffAssumptions debts={debts} input={input} setInput={setInput} />
          <Button variant="primary">Update projection</Button>
        </form>
      </Card>
      {(error || results.error) && (
        <p role="alert" className="text-sm text-rose-300">
          {error || results.error}
        </p>
      )}
      {results.report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Eligible balances', formatMoney(results.report.initialCents)],
              ['Known minimum obligations', formatMoney(results.report.minimumCents)],
              ['Estimated payoff', results.report.payoffDate ?? 'Incomplete / not reached'],
              ['Months to payoff', results.report.months ?? 'Incomplete'],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <strong className="mt-2 block">{value}</strong>
              </Card>
            ))}
          </div>
          {results.report.missing.length > 0 && (
            <p className="text-sm text-amber-200">
              Incomplete projection: {results.report.missing.map((d) => d.name).join(', ')} needs a
              balance, APR or minimum. Estimates below cover eligible debts only.
            </p>
          )}
          {!!results.report.shortfallCents && (
            <p role="alert" className="text-sm text-rose-300">
              Planning funds shortfall: {formatMoney(results.report.shortfallCents)} monthly.
              Protect living essentials and legal obligations before extra debt payments.
            </p>
          )}
          <Card className="overflow-x-auto p-4">
            <h2 className="mb-3 font-semibold">Strategy comparison</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Months</th>
                  <th>Estimated interest</th>
                  <th>Interest saved vs minimums</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Minimums', results.baseline],
                  ['Snowball', results.snowball],
                  ['Avalanche', results.avalanche],
                ].map(([label, r]) => {
                  const v = r as typeof results.report
                  return (
                    <tr key={label as string}>
                      <td className="py-2">{label as string}</td>
                      <td>{v.months ?? 'Incomplete'}</td>
                      <td>
                        {formatMoney(v.interestCents)}
                        {!v.complete ? ' (partial)' : ''}
                      </td>
                      <td>
                        {results.baseline!.complete && v.complete
                          ? formatMoney(results.baseline!.interestCents - v.interestCents)
                          : 'Unknown'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Card className="p-4">
            <h2 className="font-semibold">Recommended payment order</h2>
            <ol className="mt-2 list-inside list-decimal text-sm">
              {results.report.order.map((d) => (
                <li key={d.id} className="py-1">
                  {d.name} ·{' '}
                  {d.payoffMonth ? `month ${d.payoffMonth}` : 'not paid off in projection'} ·
                  interest {formatMoney(d.interestCents)}
                </li>
              ))}
            </ol>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-400">
                Estimated monthly payoff timeline
              </summary>
              <div className="max-h-64 overflow-auto text-xs">
                {results.report.timeline.map((m) => (
                  <p key={m.month} className="py-1">
                    {m.date} · paid {formatMoney(m.paidCents)} · interest{' '}
                    {formatMoney(m.interestCents)} · left {formatMoney(m.remainingCents)}
                  </p>
                ))}
              </div>
            </details>
          </Card>
          {save && (
            <Button
              disabled={busy}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await save(input)
                  setError('')
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Saving…' : 'Save projected scenario snapshot'}
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-slate-500">
        Planning only. Interest is rounded half-up monthly, then minimums and extra are applied;
        first payment is the first day of the following month. Snowball/avalanche/custom roll freed
        minimums forward. No daily interest, future fees or contract changes are assumed.
        Mathematical order does not determine legal or credit outcomes. Unverified amounts and all
        assumptions remain estimates.
      </p>
    </div>
  )
}
