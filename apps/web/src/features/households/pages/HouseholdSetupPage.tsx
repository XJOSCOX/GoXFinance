import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createHouseholdSchema } from '@goxfinance/shared'
import { Brand } from '../../../components/layout/Brand'
import { Button, Card, Input } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../hooks/useHousehold'
import { useNotify } from '../../../components/ui/useNotify'

export function HouseholdSetupPage() {
  const { create } = useHousehold()
  const navigate = useNavigate()
  const notify = useNotify()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    const parsed = createHouseholdSchema.safeParse({ name })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter a household name'); return }
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await create(parsed.data.name); notify('success', 'Household created successfully'); navigate('/dashboard', { replace: true }) }
    catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <div className="app-shell grid min-h-screen place-items-center p-4">
    <Card className="w-full max-w-[460px] p-7 sm:p-9">
      <Brand />
      <h1 className="mt-9 text-3xl font-semibold tracking-tight">Set up your household</h1>
      <p className="mt-2 text-sm text-slate-400">Give your household a name to get started.</p>
      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-300">Household name</span>
          <Input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Our household" />
        </label>
        {error && <p role="alert" className="rounded-lg border border-[#b08985]/25 bg-[#b08985]/10 p-3 text-sm text-rose-300">{error}</p>}
        <Button className="w-full" type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create household'}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">Have an invitation? <Link to="/household/join" className="text-[#b7c7b5] hover:underline">Join a household</Link></p>
    </Card>
  </div>
}
