import { useCallback, useState, useRef } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import type { PlaidLinkSession } from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui'
import { apiRequest, errorMessage } from '../../../lib/api'
export function PlaidLinkDialog({
  session,
  home,
  close,
  saved,
}: {
  session: PlaidLinkSession
  home: string
  close: () => void
  saved: () => void
}) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('')
  const saving = useRef(false)
  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      if (saving.current) return
      saving.current = true
      setBusy(true)
      setFailure('')
      try {
        await apiRequest(`households/${home}/banking/plaid/exchange`, {
          method: 'POST',
          body: JSON.stringify({
            attemptId: session.attemptId,
            publicToken: publicToken || (session.updating ? 'update-' + crypto.randomUUID() : ''),
          }),
        })
        saved()
        close()
      } catch (e) {
        setFailure(errorMessage(e))
      } finally {
        saving.current = false
        setBusy(false)
      }
    },
    [home, session, close, saved],
  )
  const { open, ready, error } = usePlaidLink({
    token: session.linkToken,
    onSuccess,
    onExit: () => {
      if (!saving.current) setBusy(false)
    },
  })
  return (
    <Modal
      title={session.updating ? 'Update Sandbox authorization' : 'Connect a Sandbox institution'}
      onClose={() => {
        if (!busy) close()
      }}
    >
      <p className="mb-4 text-sm text-slate-400">
        Use fictional Sandbox credentials only. Bank login details stay inside Plaid Link. No
        payments or transfers are initiated.
      </p>
      {(failure || error) && (
        <p role="alert" className="mb-4 text-sm text-rose-300">
          {failure || 'Plaid Link could not load. Check connectivity and try a new session.'}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={close}>
          Close
        </Button>
        <Button variant="primary" disabled={!ready || busy || !!failure} onClick={() => open()}>
          {busy ? 'Saving connection…' : 'Open Plaid Sandbox'}
        </Button>
      </div>
    </Modal>
  )
}
