import type { HouseholdSummary } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'

export function HouseholdDetailsDialog({ household, memberCount, onClose, onEdit }: {
  household: HouseholdSummary
  memberCount: number | null
  onClose: () => void
  onEdit?: () => void
}) {
  return <Modal title="Household details" onClose={onClose}>
    <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-4 text-sm">
      <dt className="text-slate-400">Name</dt><dd>{household.name}</dd>
      <dt className="text-slate-400">Members</dt><dd>{memberCount ?? 'Loading'}</dd>
      <dt className="text-slate-400">Your access</dt><dd className="capitalize">{household.role}</dd>
      <dt className="text-slate-400">Living here since</dt><dd>{household.moveInDate
        ? new Date(`${household.moveInDate}T00:00:00`).toLocaleDateString() : 'Not added'}</dd>
      <dt className="text-slate-400">Created</dt><dd>{new Date(household.createdAt).toLocaleDateString()}</dd>
      <dt className="text-slate-400">Notes</dt><dd className="whitespace-pre-wrap break-words">{household.notes || 'No notes'}</dd>
    </dl>
    <div className="mt-6 flex justify-end gap-2"><Button type="button" onClick={onClose}>Close</Button>
      {onEdit && <Button type="button" variant="primary" onClick={onEdit}>Edit household</Button>}</div>
  </Modal>
}
