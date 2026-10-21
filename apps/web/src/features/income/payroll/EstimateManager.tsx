import { useEffect, useState } from 'react'
import type { PayrollProfile, PayrollWeek } from '@goxfinance/shared'
import { loadPayroll, savePayroll } from './payrollClient'
import { PayrollHoursForm } from './PayrollHoursForm'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
export function EstimateManager({
  home,
  week,
  close,
  changed,
}: {
  home: string
  week: PayrollWeek
  close: () => void
  changed: () => void
}) {
  const [profile, setProfile] = useState<PayrollProfile>(),
    [error, setError] = useState(''),
    [action, setAction] = useState(''),
    notify = useNotify()
  useEffect(() => {
    let active = true
    void loadPayroll(home)
      .then((d) => {
        if (active) setProfile(d.profiles.find((p) => p.sourceId === week.sourceId))
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home, week.sourceId])
  async function persist(path: string, body: unknown) {
    try {
      await savePayroll(home, path, action === 'delete' ? 'POST' : 'PATCH', body)
      notify('success', action === 'delete' ? 'Estimate deleted' : 'Estimate updated')
      changed()
    } catch (e) {
      notify('error', errorMessage(e))
      throw e
    }
  }
  if (action === 'edit' && profile)
    return (
      <PayrollHoursForm
        week={week}
        profile={profile}
        close={close}
        save={async (raw) => {
          const b = raw as {
            values: { hours: unknown; submit: boolean; idempotencyKey: string }
            revision: number
            reason: string
          }
          await persist(`/weeks/${week.id}`, {
            ...b.values,
            values: b.values.hours,
            hours: undefined,
            revision: b.revision,
            reason: b.reason,
          })
        }}
      />
    )
  if (action === 'delete')
    return (
      <FinancialEditor
        title="Delete estimate"
        record={week}
        close={close}
        submitLabel="Delete estimate"
        build={() => null}
        save={async (raw) => {
          const b = raw as { revision: number; reason: string }
          await persist(`/weeks/${week.id}/cancel`, { revision: b.revision, reason: b.reason })
        }}
      >
        <p className="text-sm text-slate-400">
          Remove this saved estimate? Its forecast and audit history are retained. Actual paychecks
          and deposits cannot be deleted here.
        </p>
      </FinancialEditor>
    )
  return (
    <Modal title="Manage estimate" onClose={close}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          {week.workweekStart} - {week.workweekEnd}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!profile} onClick={() => setAction('edit')}>
            Edit estimate
          </Button>
          <Button onClick={() => setAction('delete')}>Delete estimate</Button>
        </div>
      </div>
    </Modal>
  )
}
