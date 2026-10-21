import { useEffect, useState } from 'react'
import type { IncomeSource, PayrollData } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { Modal } from '../../../components/ui/Modal'
import { FormField, Select } from '../../../components/ui/FormField'
import { Button } from '../../../components/ui'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { loadPayroll, savePayroll } from './payrollClient'
import { PayrollProfileForm } from './PayrollProfileForm'
import { PaycheckEstimateFields } from './PaycheckEstimateFields'
import { paycheckEstimateHours } from './paycheck-estimate'
export function PaycheckEstimator({
  home,
  sources,
  close,
  saved,
}: {
  home: string
  sources: IncomeSource[]
  close: () => void
  saved: (source: string) => void
}) {
  const [data, setData] = useState<PayrollData>(),
    [error, setError] = useState(''),
    [sourceId, setSourceId] = useState(''),
    [settings, setSettings] = useState(false),
    notify = useNotify()
  useEffect(() => {
    let active = true
    void loadPayroll(home)
      .then((d) => {
        if (active) setData(d)
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home])
  const available = sources.filter(
      (s) =>
        s.canManage && !s.isArchived && s.status === 'active' && s.incomeType !== 'trading_payout',
    ),
    source = available.find((s) => s.id === sourceId),
    storedProfile = data?.profiles.find((p) => p.sourceId === sourceId),
    profile = storedProfile
      ? { ...storedProfile, payFrequency: storedProfile.payFrequency ?? source?.frequency }
      : undefined
  const selector = (
    <FormField label="Employer">
      <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
        <option value="">Choose employer</option>
        {available.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </FormField>
  )
  if (settings && source)
    return (
      <PayrollProfileForm
        source={source}
        profile={profile}
        close={() => setSettings(false)}
        save={async (body) => {
          await savePayroll(home, '/profile', 'PUT', body)
          setData(await loadPayroll(home))
          notify('success', 'Payroll settings saved')
        }}
      />
    )
  if (!data || !profile)
    return (
      <Modal title="Estimate next paycheck" onClose={close} className="max-w-xl">
        <div className="space-y-4">
          {error ? (
            <p role="alert">{error}</p>
          ) : !data ? (
            <p role="status">Loading employers...</p>
          ) : (
            <>
              {selector}
              {!available.length ? (
                <p className="text-sm text-slate-400">
                  Add an employer or upload a paycheck first.
                </p>
              ) : source ? (
                <>
                  <p className="text-sm text-slate-400">
                    Set up the pay frequency and rates for {source.name} before saving an estimate.
                  </p>
                  <Button onClick={() => setSettings(true)}>Set up payroll</Button>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Choose an employer, then enter the work period, payday and hours.
                </p>
              )}
            </>
          )}
        </div>
      </Modal>
    )
  return (
    <FinancialEditor
      key={sourceId}
      title="Estimate next paycheck"
      close={close}
      submitLabel="Save forecast"
      build={(f) => paycheckEstimateHours(f, profile)}
      save={async (raw) => {
        const b = raw as { idempotencyKey: string; values: unknown }
        await savePayroll(home, '/weeks', 'POST', {
          ...b,
          revision: 0,
          reason: 'User saved a paycheck estimate',
          submit: false,
        })
        notify('success', 'Paycheck forecast saved. No income was recorded as received.')
        saved(sourceId)
      }}
    >
      {selector}
      <PaycheckEstimateFields profile={profile} weeks={data.weeks} />
    </FinancialEditor>
  )
}
