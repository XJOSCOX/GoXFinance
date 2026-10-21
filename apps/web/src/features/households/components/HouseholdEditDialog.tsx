import { useRef, useState, type FormEvent } from 'react'
import { updateHouseholdSchema, type HouseholdSummary } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { updateHousehold } from '../api/householdClient'
import { useHousehold } from '../hooks/useHousehold'

export function HouseholdEditDialog({ household, onClose }: { household: HouseholdSummary; onClose: () => void }) {
  const { refresh } = useHousehold()
  const notify = useNotify()
  const [name, setName] = useState(household.name)
  const [moveInDate, setMoveInDate] = useState(household.moveInDate ?? '')
  const [notes, setNotes] = useState(household.notes ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    const parsed = updateHouseholdSchema.safeParse({ name, moveInDate: moveInDate || null, notes: notes.trim() || null })
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message
      setFieldErrors(fields)
      return
    }
    busyRef.current = true
    setBusy(true)
    setFieldErrors({})
    setError('')
    try {
      await updateHousehold(household.id, parsed.data)
      await refresh()
      notify('success', 'Household details updated')
      onClose()
    } catch (failure) { const message = errorMessage(failure); setError(message); notify('error', message) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <Modal title="Edit household" onClose={onClose}>
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Household name</span>
        <Input required maxLength={120} value={name} onChange={event => setName(event.target.value)} />
        {fieldErrors.name && <span role="alert" className="mt-1 block text-rose-300">{fieldErrors.name}</span>}</label>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Living here since</span>
        <Input type="date" value={moveInDate} onChange={event => setMoveInDate(event.target.value)} />
        {fieldErrors.moveInDate && <span role="alert" className="mt-1 block text-rose-300">{fieldErrors.moveInDate}</span>}</label>
      <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Notes</span>
        <textarea placeholder="Add optional details or notes" rows={4} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)}
          className="w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 py-2 text-sm text-[#edecea] outline-none focus:border-[#a9b8a9]" />
        {fieldErrors.notes && <span role="alert" className="mt-1 block text-rose-300">{fieldErrors.notes}</span>}</label>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2 pt-2"><Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
    </form>
  </Modal>
}
