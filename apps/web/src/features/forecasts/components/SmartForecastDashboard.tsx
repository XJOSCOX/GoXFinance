import { useRef, useState } from 'react'
import {
  forecast,
  smartForecastInput,
  type ForecastData,
  type ForecastInput,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { useNotify } from '../../../components/ui/useNotify'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useLocalToday } from '../../../lib/useLocalToday'
import { formatMoney } from '../../../lib/money'
import { OpeningCashForm } from './OpeningCashForm'
import { SmartTimeline } from './SmartTimeline'
import { SmartEvents } from './SmartEvents'
import { SmartWhatIf } from './SmartWhatIf'

export function SmartForecastDashboard({
  home,
  data,
  refresh,
}: {
  home: string
  data: ForecastData
  refresh: () => void
}) {
  const today = useLocalToday(),
    notify = useNotify()
  const [days, setDays] = useState(30),
    [draft, setDraft] = useState<ForecastInput | null>(null),
    [opening, setOpening] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [resetVersion, setResetVersion] = useState(0)
  const key = useRef(crypto.randomUUID())
  const base = smartForecastInput(data.settings, today, days)
  const input: ForecastInput = draft
    ? {
        ...draft,
        startDate: base.startDate,
        endDate: base.endDate,
        startingCents: base.startingCents,
        smart: {
          ...draft.smart!,
          opening: base.smart!.opening,
          settingsVersionId: base.smart!.settingsVersionId,
        },
      }
    : base
  let report, baseline
  try {
    baseline = forecast(data.sources, base, today)
    report = forecast(data.sources, input, today)
  } catch (failure) {
    return (
      <p role="alert" className="text-rose-300">
        {errorMessage(failure)}
      </p>
    )
  }
  const smart = report.smart!
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Forecast range" className="flex flex-wrap gap-1">
          {[7, 14, 30, 60, 90].map((n) => (
            <Button
              key={n}
              size="small"
              variant={days === n ? 'primary' : 'ghost'}
              aria-pressed={days === n}
              onClick={() => {
                setDays(n)
                key.current = crypto.randomUUID()
              }}
            >
              {n} days
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" onClick={refresh}>
            Refresh sources
          </Button>
          {data.canSave && (
            <Button size="small" onClick={() => setOpening(true)}>
              Confirm cash / buffer
            </Button>
          )}
        </div>
      </div>
      {smart.openingRequired && (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-200"
        >
          Opening cash balance required for a complete cash projection.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          [
            'Opening available cash',
            formatMoney(input.smart!.opening?.amountCents ?? null),
            input.smart!.opening
              ? `Confirmed effective ${input.smart!.opening.effectiveDate}`
              : 'Explicit confirmation needed',
          ],
          [
            'Next expected paycheck',
            formatMoney(smart.nextPaycheck?.amountCents ?? null),
            smart.nextPaycheck?.date ?? 'Date unknown',
          ],
          [
            'Upcoming cash requirements',
            `${formatMoney(report.outflowCents)}${report.events.some((e) => e.direction === 'out' && e.amountCents === null) ? ' + unknown' : ''}`,
            'Known amounts · not completed payments',
          ],
          [
            'Projected ending cash',
            formatMoney(report.endingCents),
            `${days}-day view${report.incomplete ? ' · Incomplete' : ''}`,
          ],
          [
            'Lowest projected cash',
            formatMoney(report.lowestCents),
            'Daily balances; no intraday guarantee',
          ],
          [
            'Forecast status',
            smart.health.replaceAll('_', ' '),
            report.incomplete
              ? 'Review missing information'
              : `${smart.daysBelowBuffer} days below buffer`,
          ],
        ].map(([label, value, detail]) => (
          <Card key={label} className="min-w-0 p-3">
            <p className="text-[11px] text-slate-400">{label}</p>
            <strong
              className={`mt-2 block break-words text-base capitalize tabular-nums ${label === 'Forecast status' ? (smart.health === 'within_plan' ? 'text-emerald-300' : 'text-amber-200') : ''}`}
            >
              {value}
            </strong>
            <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)]">
        <SmartTimeline report={report} />
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="font-semibold">Before the next paycheck</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Bills / debt payments</dt>
              <dd>
                {formatMoney(smart.billsBeforePaydayCents)}
                {smart.unknownBeforePayday ? ' + unknown' : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Available after obligations</dt>
              <dd>{formatMoney(smart.availableAfterObligationsCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Safety buffer</dt>
              <dd>{formatMoney(smart.bufferCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Known projected net change</dt>
              <dd>{formatMoney(report.netChangeCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Known totals exclude unknown amounts. Forecasts are planning estimates, not guaranteed
            available bank cash.
          </p>
          <details
            className="mt-4 border-t border-white/10 pt-3"
            open={smart.risks.some((r) => r.kind === 'negative')}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Insights & missing information ({smart.risks.length})
            </summary>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto">
              {smart.risks.length ? (
                smart.risks.map((r) => (
                  <section key={r.id} className="border-l-2 border-amber-300/40 pl-3 text-xs">
                    <p className="font-semibold text-amber-200">
                      {r.date} · {r.kind.replaceAll('_', ' ')} · {formatMoney(r.amountCents)}
                    </p>
                    <p className="mt-1 text-slate-300">{r.reason}</p>
                    <p className="mt-1 text-slate-500">
                      {r.confidence} · {r.eventIds.length} related events
                    </p>
                    <p className="mt-1 text-slate-400">{r.actions.join(' · ')}</p>
                    {r.eventIds.length > 0 && (
                      <p className="mt-1 text-slate-500">
                        Related:{' '}
                        {report.events
                          .filter((event) => r.eventIds.includes(event.id))
                          .slice(0, 3)
                          .map((event) => `${event.name} (${event.date})`)
                          .join(' · ')}
                      </p>
                    )}
                  </section>
                ))
              ) : (
                <p className="text-xs text-slate-400">
                  No buffer or shortfall signals in the known data under these assumptions.
                </p>
              )}
            </div>
          </details>
        </Card>
      </div>
      <SmartWhatIf
        key={`${days}:${data.settings?.id ?? 'none'}:${resetVersion}`}
        input={input}
        baseline={baseline}
        report={report}
        sources={data.sources}
        update={(value) => {
          setDraft(value)
          key.current = crypto.randomUUID()
        }}
        reset={() => {
          setDraft(null)
          setResetVersion((v) => v + 1)
          key.current = crypto.randomUUID()
        }}
      />
      <SmartEvents home={home} report={report} />
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {data.canSave && (
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            if (busy) return
            setBusy(true)
            setError('')
            try {
              await apiRequest(`households/${home}/forecasts`, {
                method: 'POST',
                body: JSON.stringify({
                  idempotencyKey: key.current,
                  fingerprint: data.fingerprint,
                  values: input,
                }),
              })
              notify('success', 'Smart forecast snapshot saved')
              key.current = crypto.randomUUID()
              refresh()
            } catch (failure) {
              setError(errorMessage(failure))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Saving…' : 'Save immutable snapshot'}
        </Button>
      )}
      {opening && (
        <OpeningCashForm
          home={home}
          data={data}
          close={() => setOpening(false)}
          saved={() => {
            setOpening(false)
            notify('success', 'Cash confirmation and buffer saved')
            refresh()
          }}
        />
      )}
    </div>
  )
}
