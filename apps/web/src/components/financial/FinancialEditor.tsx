import { useRef, useState, type ReactNode } from 'react'
import { Button, Input } from '../ui'
import { Modal } from '../ui/Modal'
import { FormField } from '../ui/FormField'
import { errorMessage } from '../../lib/api'
export function FinancialEditor({
  title,
  record,
  build,
  save,
  close,
  children,
  submitLabel = 'Save record',
  reasonLabel = 'Reason for correction',
}: {
  title: string
  record?: { revision: number }
  build: (data: FormData) => unknown
  save: (body: unknown) => Promise<void>
  close: () => void
  children: ReactNode
  submitLabel?: string
  reasonLabel?: string
}) {
  const key = useRef(crypto.randomUUID()),
    pending = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending.current) close()
      }}
      framed
      className="max-w-3xl"
    >
      <form
        className="flex min-h-0 flex-col"
        onSubmit={async (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (pending.current) return
          pending.current = true
          setBusy(true)
          setError('')
          try {
            const data = new FormData(event.currentTarget),
              values = build(data)
            await save(
              record
                ? {
                    revision: record.revision,
                    reason: String(data.get('correctionReason') ?? ''),
                    values,
                  }
                : { idempotencyKey: key.current, values },
            )
            close()
          } catch (e) {
            setError(errorMessage(e))
          } finally {
            pending.current = false
            setBusy(false)
          }
        }}
      >
        <div className="min-h-0 overflow-y-auto p-5 sm:p-7">
          <fieldset disabled={busy} className="space-y-5">
            {children}
            {record && (
              <FormField label={reasonLabel}>
                <Input
                  name="correctionReason"
                  placeholder="Briefly explain what changed"
                  required
                  maxLength={2000}
                />
              </FormField>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            )}
          </fieldset>
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 bg-[#1b1d1c] p-4">
          <Button type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? 'Saving...' : submitLabel}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
