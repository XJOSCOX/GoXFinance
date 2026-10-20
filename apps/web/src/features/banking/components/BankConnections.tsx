import { lazy, Suspense, useRef, useState } from 'react'
import type {
  BankConnection,
  BankSyncPreview,
  PlaidAvailability,
  PlaidLinkSession,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useBanking } from '../hooks/useBanking'
const LinkDialog = lazy(() =>
  import('./PlaidLinkDialog').then((m) => ({ default: m.PlaidLinkDialog })),
)
export function BankConnections({
  home,
  connections,
  refresh,
}: {
  home: string
  connections: BankConnection[]
  refresh: () => void
}) {
  const { data: status, error: statusError, refresh: refreshStatus } = useBanking<PlaidAvailability>(
      home,
      '/plaid/status',
    ),
    [session, setSession] = useState<PlaidLinkSession>(),
    [preview, setPreview] = useState<BankSyncPreview>(),
    [disconnect, setDisconnect] = useState<BankConnection>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    pending = useRef(false),
    notify = useNotify()
  async function post<T>(path: string, body: unknown = {}) {
    return apiRequest<T>(`households/${home}/banking/plaid${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }
  async function run(work: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function saved() {
    refresh()
    refreshStatus()
    notify(
      'success',
      'Sandbox connection saved. Preview synchronization to import available history.',
    )
  }
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Plaid Sandbox</h2>
          <p className="mt-1 text-xs text-slate-400">
            {status?.enabled
              ? `${status.remainingItems} of ${status.itemCap} local lifetime Item reservations remain`
              : (status?.reason || statusError || 'Checking connection configuration…')}
          </p>
        </div>
        <Button
          disabled={busy || !status?.enabled || status.remainingItems === 0}
          onClick={() =>
            void run(async () =>
              setSession(
                await post<PlaidLinkSession>('/link', {
                  idempotencyKey: crypto.randomUUID(),
                  connectionId: null,
                }),
              ),
            )
          }
        >
          Connect Sandbox bank
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Live banking is disabled. Reservations, including abandoned attempts, remain consumed after
        disconnect. Local counters do not replace Plaid’s usage or billing controls.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {connections.map((c) => (
          <div
            key={c.id}
            className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"
          >
            <div>
              <p className="text-sm">
                {c.institution} · {c.status.replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {c.lastSyncAt
                  ? `Last sync ${new Date(c.lastSyncAt).toLocaleString()}`
                  : 'No successful synchronization'}
                {c.errorCode ? ` · ${c.errorCode}` : ''}
              </p>
            </div>
            {c.status !== 'disconnected' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="small"
                  disabled={busy || !status?.enabled || c.status === 'disabled'}
                  onClick={() =>
                    void run(async () =>
                      setPreview(await post<BankSyncPreview>(`/${c.id}/preview`)),
                    )
                  }
                >
                  Sync Now
                </Button>
                <Button
                  size="small"
                  disabled={busy || !status?.enabled}
                  onClick={() =>
                    void run(async () =>
                      setSession(
                        await post<PlaidLinkSession>('/link', {
                          idempotencyKey: crypto.randomUUID(),
                          connectionId: c.id,
                        }),
                      ),
                    )
                  }
                >
                  Update authorization
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await post(`/${c.id}/disable`, { disabled: c.status !== 'disabled' })
                      refresh()
                      notify('success', c.status === 'disabled' ? 'Sync enabled' : 'Sync disabled')
                    })
                  }
                >
                  {c.status === 'disabled' ? 'Enable sync' : 'Disable sync'}
                </Button>
                <Button
                  size="small"
                  disabled={busy || !status?.enabled}
                  onClick={() => setDisconnect(c)}
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {session && (
        <Suspense fallback={<p role="status">Loading Sandbox Link…</p>}>
          <LinkDialog
            session={session}
            home={home}
            close={() => setSession(undefined)}
            saved={saved}
          />
        </Suspense>
      )}
      {preview && (
        <Modal
          title="Review synchronization"
          onClose={() => {
            if (!busy) setPreview(undefined)
          }}
        >
          <p className="text-sm">
            {preview.accounts} provider accounts · {preview.added} additions · {preview.modified}{' '}
            changes · {preview.removed} removals
          </p>
          <p className="my-4 text-sm text-slate-400">
            Import the history currently available from Plaid into the inbox. No financial entries
            are created. Modified or removed reconciled activity will require review. Unsupported
            account types are excluded.
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setPreview(undefined)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post(`/${preview.connectionId}/sync`, { previewId: preview.previewId })
                  setPreview(undefined)
                  refresh()
                  notify('success', 'Bank synchronization saved to the inbox')
                })
              }
            >
              {busy ? 'Saving…' : 'Confirm synchronization'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-rose-300">
              {error}
            </p>
          )}
        </Modal>
      )}
      {disconnect && (
        <Modal
          title="Disconnect institution?"
          onClose={() => {
            if (!busy) setDisconnect(undefined)
          }}
        >
          <p className="mb-4 text-sm text-slate-400">
            This removes the provider Item and stops synchronization. Reviewed financial history
            remains. It does not replenish lifetime Item capacity.
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setDisconnect(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post(`/${disconnect.id}/disconnect`)
                  setDisconnect(undefined)
                  refresh()
                  refreshStatus()
                  notify('success', 'Institution disconnected; history retained')
                })
              }
            >
              Disconnect
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-rose-300">
              {error}
            </p>
          )}
        </Modal>
      )}
    </Card>
  )
}
