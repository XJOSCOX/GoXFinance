import { useState, type FormEvent } from 'react'
import type { HouseholdSummary } from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { updateHousehold } from '../api/householdClient'
import { useHousehold } from '../hooks/useHousehold'

export function HouseholdSettings({ household }: { household: HouseholdSummary }) {
  const { refresh } = useHousehold()
  const [name, setName] = useState(household.name)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try { await updateHousehold(household.id, name.trim()); await refresh(); setMessage('Household name updated.') }
    catch (failure) { setMessage(errorMessage(failure)) }
    finally { setBusy(false) }
  }

  return <Card className="mt-8 p-5">
    <h2 className="text-base font-semibold">Household settings</h2>
    <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
      <label className="min-w-0 flex-1 text-sm"><span className="mb-1.5 block text-slate-300">Household name</span>
        <Input value={name} required maxLength={120} onChange={event => setName(event.target.value)} /></label>
      <Button type="submit" disabled={busy || !name.trim() || name.trim() === household.name}>{busy ? 'Saving…' : 'Save name'}</Button>
    </form>
    {message && <p role="status" className="mt-3 text-sm text-slate-400">{message}</p>}
  </Card>
}
