import type { HouseholdMember } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'

export function MemberDetailsDialog({ member, onClose, onEdit }: { member: HouseholdMember; onClose: () => void; onEdit?: () => void }) {
  return <Modal title={member.fullName} onClose={onClose}>
    <dl className="space-y-4 text-sm">
      <div><dt className="text-slate-500">Relationship</dt><dd className="mt-1 capitalize text-slate-200">{member.relationship}</dd></div>
      <div><dt className="text-slate-500">Status</dt><dd className="mt-1 capitalize text-slate-200">{member.status}</dd></div>
      {member.accessRole && <div><dt className="text-slate-500">Access role</dt><dd className="mt-1 capitalize text-slate-200">{member.accessRole}</dd></div>}
      {member.notes && <div><dt className="text-slate-500">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-slate-200">{member.notes}</dd></div>}
    </dl>
    <div className="mt-7 flex justify-end gap-3"><Button type="button" onClick={onClose}>Close</Button>
      {onEdit && <Button type="button" variant="primary" onClick={onEdit}>Edit member</Button>}</div>
  </Modal>
}
