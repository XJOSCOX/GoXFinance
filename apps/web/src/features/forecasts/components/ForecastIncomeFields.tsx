import { upcomingPayday, type ForecastSources, type ForecastInput } from '@goxfinance/shared'
import { Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
export function ForecastIncomeFields({
  sources,
  initial,
  start,
}: {
  sources: ForecastSources
  initial: ForecastInput
  start: string
}) {
  return (
    <details>
      <summary className="cursor-pointer text-sm text-slate-400">
        Income assumptions by source
      </summary>
      <p className="my-2 text-xs text-slate-400">
        Enter take-home estimates per paycheck and its first date. Hourly gross uses entered hours
        only and is never substituted for take-home pay. Biweekly uses this date as its anchor;
        irregular and semimonthly sources include only the entered date (add other dates below).
      </p>
      {sources.income.sources
        .filter((s) => s.status === 'active' && !s.isArchived && s.incomeType !== 'trading_payout')
        .map((s) => {
          const a = initial.income.find((a) => a.sourceId === s.id)
          return (
            <section key={s.id} className="my-3 space-y-2 rounded-lg border border-white/10 p-3">
              <h3 className="text-sm font-semibold">
                {s.name} · {s.frequency}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="First expected paycheck date">
                  <Input
                    name={s.id + ':date'}
                    type="date"
                    defaultValue={a?.firstPayDate ?? upcomingPayday(s, start) ?? ''}
                  />
                </FormField>
                {(['conservative', 'expected', 'optimistic'] as const).map((mode) => {
                  const net =
                    a?.[
                      mode === 'conservative'
                        ? 'conservativeNetCents'
                        : mode === 'optimistic'
                          ? 'optimisticNetCents'
                          : 'expectedNetCents'
                    ] ?? (mode === 'expected' ? s.expectedNetCents : null)
                  return (
                    <FormField key={mode} label={mode + ' net per paycheck ($)'}>
                      <Input
                        name={s.id + ':' + mode}
                        inputMode="decimal"
                        defaultValue={net === null ? '' : (net / 100).toFixed(2)}
                        placeholder="Unknown"
                      />
                    </FormField>
                  )
                })}
                {s.incomeType === 'hourly' && (
                  <>
                    <FormField label="Assumed regular hours">
                      <Input
                        name={s.id + ':regular'}
                        defaultValue={a?.regularHours ?? ''}
                        inputMode="decimal"
                      />
                    </FormField>
                    <FormField label="Assumed overtime hours">
                      <Input
                        name={s.id + ':overtime'}
                        defaultValue={a?.overtimeHours ?? ''}
                        inputMode="decimal"
                      />
                    </FormField>
                  </>
                )}
              </div>
            </section>
          )
        })}
    </details>
  )
}
