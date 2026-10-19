import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'

export function ConfirmDeactivateDialog({ name, linked, busy, onClose, onConfirm }: { name: string; linked: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={linked ? 'Remove from household' : 'Deactivate member'} onClose={onClose}>
    <p className="text-sm leading-6 text-slate-400">{linked
      ? `Remove ${name}'s access to this household? Their member record will remain inactive. Their account and other households are unaffected.`
      : `Deactivate ${name}? Their record will remain and can be reactivated later.`}</p>
    <div className="mt-6 flex justify-end gap-3">
      <Button type="button" onClick={onClose}>Cancel</Button>
      <Button type="button" variant="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Saving…' : linked ? 'Remove access' : 'Deactivate'}</Button>
    </div>
  </Modal>
}
