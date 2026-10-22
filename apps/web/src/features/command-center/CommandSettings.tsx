import { useState } from 'react'
import { Link } from 'react-router-dom'
import { commandModules, type CommandCenter, type CommandPreferences } from '@goxfinance/shared'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui'
import { apiRequest, errorMessage } from '../../lib/api'
import { quickLabels } from './command-quick-actions'
export function CommandSettings({
  data: d,
  home,
  close,
  saved,
}: {
  data: CommandCenter
  home: string
  close: () => void
  saved: () => void
}) {
  const [values, setValues] = useState<CommandPreferences>(d.preferences),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  function toggle<K extends 'expanded' | 'quickActions' | 'indicators'>(
    key: K,
    value: CommandPreferences[K][number],
  ) {
    setValues((v) => ({
      ...v,
      [key]: v[key].includes(value as never)
        ? v[key].filter((x) => x !== value)
        : [...v[key], value],
    }))
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      await apiRequest(`households/${home}/command-center/preferences`, {
        method: 'PUT',
        body: JSON.stringify({
          revision: d.preferenceRevision,
          idempotencyKey: crypto.randomUUID(),
          values,
        }),
      })
      saved()
      close()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Customize Command Center" onClose={close}>
      <div className="space-y-5">
        <label className="block text-sm">
          Timeline period
          <select
            className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151716] p-2"
            value={values.periodDays}
            onChange={(e) =>
              setValues((v) => ({ ...v, periodDays: Number(e.target.value) as 14 | 30 }))
            }
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.compact}
            onChange={(e) => setValues((v) => ({ ...v, compact: e.target.checked }))}
          />
          Compact actions and obligations
        </label>
        <fieldset>
          <legend className="mb-2 text-sm">Expanded sections</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['timeline', 'progress', 'insights', 'allocations'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={values.expanded.includes(k)}
                  onChange={() => toggle('expanded', k)}
                />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm">Quick actions</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {commandModules
              .filter((k) =>
                k === 'balance' ? d.owner : !['upload', 'estimate'].includes(k) || d.canManage,
              )
              .map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.quickActions.includes(k)}
                    onChange={() => toggle('quickActions', k)}
                  />
                  {quickLabels[k]}
                </label>
              ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm">Progress indicators</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['income', 'budget', 'goals', 'debt'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={values.indicators.includes(k)}
                  onChange={() => toggle('indicators', k)}
                />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-slate-400">
          Display preferences apply to your account in this household. Serious risks remain visible.
        </p>
        <Link className="block text-sm text-sky-300" to={`/households/${home}/planner?action=cash`}>
          Change safety buffer in Smart Planner
        </Link>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
