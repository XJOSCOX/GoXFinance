import { ForecastBudgetReference } from './ForecastBudgetReference'
import { ForecastIncomeFields } from './ForecastIncomeFields'
import { useState } from 'react'
import { forecastInputSchema, type ForecastInput, type ForecastSources } from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text } from '../../../lib/financial-entry'
import { errorMessage } from '../../../lib/api'
export function ForecastForm({
  sources,
  initial,
  update,
}: {
  sources: ForecastSources
  initial: ForecastInput
  update: (v: ForecastInput) => void
}) {
  const [items, setItems] = useState(initial.oneTime),
    [start, setStart] = useState(initial.startDate),
    [end, setEnd] = useState(initial.endDate),
    [error, setError] = useState('')
  return (
    <Card className="p-4">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          try {
            const f = new FormData(e.currentTarget)
            update(
              forecastInputSchema.parse({
                name: text(f, 'name'),
                startDate: start,
                endDate: end,
                startingCents: readMoney(f, 'starting'),
                confidence: text(f, 'confidence'),
                mode: text(f, 'mode'),
                variableSpendingCents: readMoney(f, 'spending', true),
                extraDebtCents: readMoney(f, 'extra', true),
                includeSettlements: f.has('settlements'),
                includeUncertainPayouts: f.has('payouts'),
                income: sources.income.sources
                  .filter((s) => text(f, s.id + ':date'))
                  .map((s) => ({
                    sourceId: s.id,
                    firstPayDate: text(f, s.id + ':date'),
                    conservativeNetCents: readMoney(f, s.id + ':conservative'),
                    expectedNetCents: readMoney(f, s.id + ':expected'),
                    optimisticNetCents: readMoney(f, s.id + ':optimistic'),
                    regularHours: text(f, s.id + ':regular') || null,
                    overtimeHours: text(f, s.id + ':overtime') || null,
                  })),
                oneTime: items.map((item) => ({
                  id: item.id,
                  name: text(f, item.id + ':name'),
                  date: text(f, item.id + ':date'),
                  kind: text(f, item.id + ':kind'),
                  amountCents: readMoney(f, item.id + ':amount', true),
                })),
              }),
            )
            setError('')
          } catch (err) {
            setError(errorMessage(err))
          }
        }}
      >
        <div className="flex flex-wrap gap-2">
          {[7, 14, 30, 60, 90].map((n) => (
            <Button
              key={n}
              type="button"
              onClick={() =>
                setEnd(
                  new Date(Date.parse(start + 'T00:00:00Z') + (n - 1) * 86400000)
                    .toISOString()
                    .slice(0, 10),
                )
              }
            >
              {n} days
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Scenario name">
            <Input name="name" defaultValue={initial.name} required />
          </FormField>
          <FormField label="As-of / starting date">
            <Input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <FormField label="Through date">
            <Input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </FormField>
          <FormField label="Starting cash at start of as-of date ($)">
            <Input
              name="starting"
              inputMode="decimal"
              defaultValue={
                initial.startingCents === null ? '' : (initial.startingCents / 100).toFixed(2)
              }
              placeholder="Unknown"
            />
          </FormField>
          <FormField label="Starting cash confidence">
            <Select name="confidence" defaultValue={initial.confidence}>
              {['unverified', 'estimated', 'confirmed'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Scenario">
            <Select name="mode" defaultValue={initial.mode}>
              {['conservative', 'expected', 'optimistic', 'custom'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Additional variable spending, range total ($)">
            <Input
              name="spending"
              inputMode="decimal"
              defaultValue={(initial.variableSpendingCents / 100).toFixed(2)}
              required
            />
          </FormField>
          <FormField label="Additional debt payments, range total ($)">
            <Input
              name="extra"
              inputMode="decimal"
              defaultValue={(initial.extraDebtCents / 100).toFixed(2)}
              required
            />
          </FormField>
        </div>
        <p className="text-xs text-slate-400">
          Opening cash is manual, never inferred. Additional variable spending is spread evenly
          across days; extra debt payments apply on the final day. Enter only additional spending to
          avoid duplicating bills.
        </p>
        <ForecastBudgetReference sources={sources} month={start.slice(0, 7)} />
        <ForecastIncomeFields sources={sources} initial={initial} start={start} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="settlements" defaultChecked={initial.includeSettlements} />
          Include accepted settlement schedules
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="payouts" defaultChecked={initial.includeUncertainPayouts} />
          Include explicitly entered uncertain payouts (excluded from baseline)
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-slate-400">
            One-time scenario adjustments
          </summary>
          <div className="my-3 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-2"
              >
                <FormField label="Item name">
                  <Input name={item.id + ':name'} defaultValue={item.name} required />
                </FormField>
                <FormField label="Date">
                  <Input type="date" name={item.id + ':date'} defaultValue={item.date} required />
                </FormField>
                <FormField label="Adjustment type">
                  <Select name={item.id + ':kind'} defaultValue={item.kind}>
                    <option value="expense">Additional expense</option>
                    <option value="income">Expected net income</option>
                    <option value="uncertain_payout">Uncertain payout</option>
                  </Select>
                </FormField>
                <FormField label="Amount ($)">
                  <Input
                    name={item.id + ':amount'}
                    inputMode="decimal"
                    defaultValue={(item.amountCents / 100).toFixed(2)}
                    required
                  />
                </FormField>
                <Button
                  type="button"
                  onClick={() => setItems(items.filter((r) => r.id !== item.id))}
                >
                  Remove scenario item
                </Button>
              </div>
            ))}
            <Button
              type="button"
              onClick={() =>
                setItems([
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    date: start,
                    kind: 'expense',
                    amountCents: 0,
                  },
                ])
              }
            >
              Add scenario item
            </Button>
          </div>
        </details>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <Button variant="primary">Update forecast</Button>
      </form>
    </Card>
  )
}
