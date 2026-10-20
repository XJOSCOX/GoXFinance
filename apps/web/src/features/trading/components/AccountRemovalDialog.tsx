import { useRef, useState } from 'react'
import type { TradingAccount } from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { Button, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { errorMessage } from '../../../lib/api'

export function AccountRemovalDialog({
  account,
  save,
  close,
}: {
  account: TradingAccount
  save: (permanent: boolean) => Promise<void>
  close: () => void
}) {
  const [permanent, setPermanent] = useState(false),
    [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    pending = useRef(false)
  const restoring = !!account.deletedAt
  return (
    <Modal
      title={restoring ? 'Restore account' : 'Delete account'}
      onClose={() => {
        if (!pending.current) close()
      }}
      className="max-w-lg"
    >
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (pending.current || (permanent && confirmation !== account.nickname)) return
          pending.current = true
          setBusy(true)
          setError('')
          try {
            await save(permanent)
            close()
          } catch (error) {
            setError(errorMessage(error))
          } finally {
            pending.current = false
            setBusy(false)
          }
        }}
      >
        <p className="text-sm text-slate-400">
          {restoring
            ? `Show ${account.nickname} in your accounts again.`
            : `Hide ${account.nickname} from your accounts. Its history stays in reports and you can restore it later.`}
        </p>
        <fieldset disabled={busy} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(e) => setPermanent(e.target.checked)}
            />
            Delete permanently instead
          </label>
          {permanent && (
            <>
              <p className="text-sm text-amber-200">
                This cannot be undone. The account and its results will be removed from tracking and
                totals. Accounts with any payout history cannot be permanently deleted. Historical
                references and audit records are retained for integrity; the account cannot be
                restored. Copy groups containing it will no longer be available.
              </p>
              <FormField label={`Type ${account.nickname} to confirm`}>
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              </FormField>
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || (permanent && confirmation !== account.nickname)}
          >
            {busy
              ? 'Saving...'
              : permanent
                ? 'Delete permanently'
                : restoring
                  ? 'Restore account'
                  : 'Hide account'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
