import { Button } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'

export function ConfirmDeactivateDialog({ name, busy, onClose, onConfirm }: { name: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Deactivate member" onClose={onClose}>
    <p className="text-sm leading-6 text-slate-400">Deactivate {name}? Their record will remain in the household and can be reactivated later.</p>
    <div className="mt-6 flex justify-end gap-3">
      <Button type="button" onClick={onClose}>Cancel</Button>
      <Button type="button" variant="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Deactivating…' : 'Deactivate'}</Button>
    </div>
  </Modal>
}
