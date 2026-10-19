import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { invitationCodeSchema } from '@goxfinance/shared'
import { Brand } from '../../../components/layout/Brand'
import { Button, Card, Input } from '../../../components/ui'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { redeemInvitation } from '../api/householdClient'
import { useHousehold } from '../hooks/useHousehold'

export function JoinHouseholdPage() {
  const navigate = useNavigate()
  const notify = useNotify()
  const { refresh, select } = useHousehold()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    const parsed = invitationCodeSchema.safeParse(code)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Enter an invitation code'); return }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await redeemInvitation(parsed.data)
      await refresh()
      select(result.household.householdId)
      notify('success', 'Welcome to your household')
      navigate('/dashboard', { replace: true })
    } catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <div className="app-shell grid min-h-screen place-items-center p-4"><Card className="w-full max-w-[460px] p-7 sm:p-9">
    <Brand />
    <h1 className="mt-9 text-3xl font-semibold tracking-tight">Join a household</h1>
    <p className="mt-2 text-sm text-slate-400">Enter the one-time code shared with you.</p>
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Invitation code</span>
        <Input autoFocus required autoComplete="off" value={code} onChange={event => setCode(event.target.value)} />
        {error && <span role="alert" className="mt-1 block text-rose-300">{error}</span>}
      </label>
      <Button className="w-full" type="submit" variant="primary" disabled={busy}>{busy ? 'Joining…' : 'Join household'}</Button>
    </form>
    <Link to="/dashboard" className="mt-5 block text-center text-sm text-slate-400 hover:text-white">Back to workspace</Link>
  </Card></div>
}
