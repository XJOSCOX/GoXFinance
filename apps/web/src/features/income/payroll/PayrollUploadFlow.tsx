import { useRef, useState } from 'react'
import type { PayrollUploadPreview } from '@goxfinance/shared'
import { FileText, CheckCircle2, Clock3, AlertCircle, ShieldCheck } from 'lucide-react'
import { PayrollUploadReview } from './PayrollUploadReview'
import { PaystubFilePicker } from './PaystubFilePicker'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui'
import { useNotify } from '../../../components/ui/useNotify'
import { apiRequest, errorMessage } from '../../../lib/api'
import { encodePaystub, payrollBase } from './payrollClient'
type UploadItem = {
  id: string
  name: string
  file: File | null
  status: 'queued' | 'processing' | 'reviewing' | 'saved' | 'skipped' | 'error'
  error?: string
}
export function PayrollUploadFlow({
  home,
  preferredSourceId,
  preferredWeekId,
  close,
  saved,
}: {
  home: string
  preferredSourceId?: string
  preferredWeekId?: string
  close: () => void
  saved: (sourceId: string) => void
}) {
  const [files, setFiles] = useState<File[]>([]),
    [items, setItems] = useState<UploadItem[]>([]),
    [review, setReview] = useState<{ id: string; preview: PayrollUploadPreview }>(),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    lastSavedSource = useRef<string | undefined>(undefined),
    notify = useNotify()
  const patch = (id: string, values: Partial<UploadItem>) =>
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...values } : item)))
  const finish = () => {
    if (pending.current) return
    if (lastSavedSource.current) saved(lastSavedSource.current)
    else close()
  }
  async function extract(item: UploadItem) {
    if (pending.current || !item.file) return
    pending.current = true
    setBusy(true)
    patch(item.id, { status: 'processing', error: undefined })
    try {
      // Extract only when this file is reviewed, after preceding saves. Receipts must reflect current employer/draft revisions.
      const preview = await apiRequest<PayrollUploadPreview>(
        payrollBase(home) + '/upload/preview',
        { method: 'POST', body: JSON.stringify(await encodePaystub(item.file)) },
      )
      patch(item.id, { status: 'reviewing' })
      setReview({ id: item.id, preview })
    } catch (e) {
      const error = errorMessage(e)
      patch(item.id, { status: 'error', error })
      notify('error', error)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  if (review)
    return (
      <PayrollUploadReview
        key={review.id}
        home={home}
        preview={review.preview}
        preferredSourceId={items.length === 1 ? preferredSourceId : undefined}
        preferredWeekId={items.length === 1 ? preferredWeekId : undefined}
        reviewContext={{
          fileName: items.find((i) => i.id === review.id)!.name,
          index: items.findIndex((i) => i.id === review.id) + 1,
          total: items.length,
        }}
        close={() => {
          setItems((previous) =>
            previous.map((item) =>
              item.id === review.id && item.status === 'reviewing'
                ? { ...item, status: 'queued' }
                : item,
            ),
          )
          setReview(undefined)
        }}
        saved={(sourceId) => {
          lastSavedSource.current = sourceId
          patch(review.id, { status: 'saved', file: null, error: undefined })
          setReview(undefined)
          notify('success', 'Paycheck saved. Deposit confirmation remains separate.')
        }}
      />
    )
  const completed = items.filter((i) => i.status === 'saved').length,
    remaining = items.filter((i) => !['saved', 'skipped'].includes(i.status)).length
  return (
    <Modal
      title="Upload paychecks"
      description="Choose your files, then edit and confirm each paycheck separately."
      onClose={finish}
      framed
      className="max-w-2xl"
    >
      <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
        <ol aria-label="Upload steps" className="flex flex-wrap gap-2 text-xs">
          <li
            className={`rounded-full px-3 py-1.5 ${!items.length ? 'bg-[#b1beb0]/15 text-[#c8d3c7]' : 'bg-white/5 text-slate-400'}`}
          >
            1. Select files
          </li>
          <li
            className={`rounded-full px-3 py-1.5 ${items.length && remaining ? 'bg-sky-300/10 text-sky-200' : 'bg-white/5 text-slate-400'}`}
          >
            2. Review each paycheck
          </li>
          <li
            className={`rounded-full px-3 py-1.5 ${items.length && !remaining ? 'bg-emerald-300/10 text-emerald-200' : 'bg-white/5 text-slate-400'}`}
          >
            3. Finish
          </li>
        </ol>
        {!items.length ? (
          <PaystubFilePicker files={files} change={setFiles} disabled={busy} multiple />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Your paycheck queue</h3>
              <p role="status" className="text-xs text-slate-400">
                {completed} saved · {remaining} to review
              </p>
            </div>
            <ul aria-label="Paycheck upload queue" className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border border-white/10 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {item.status === 'saved' ? (
                      <CheckCircle2
                        size={19}
                        className="shrink-0 text-emerald-300"
                        aria-hidden="true"
                      />
                    ) : item.status === 'error' ? (
                      <AlertCircle
                        size={19}
                        className="shrink-0 text-rose-300"
                        aria-hidden="true"
                      />
                    ) : (
                      <FileText size={19} className="shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.status === 'saved'
                          ? 'Saved to database'
                          : item.status === 'processing'
                            ? 'Extracting locally…'
                            : item.status === 'skipped'
                              ? 'Skipped · not saved'
                              : item.status === 'error'
                                ? 'Needs attention'
                                : 'Waiting for your review'}
                      </p>
                    </div>
                    {!['saved', 'skipped'].includes(item.status) && (
                      <div className="ml-auto flex gap-2">
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => {
                            patch(item.id, { status: 'skipped', file: null, error: undefined })
                          }}
                        >
                          Skip
                        </Button>
                        <Button
                          size="small"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void extract(item)}
                        >
                          {item.status === 'error' ? 'Retry' : 'Review & edit'}
                        </Button>
                      </div>
                    )}
                  </div>
                  {item.error && (
                    <p role="alert" className="mt-2 break-words text-xs text-rose-300">
                      {item.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {busy && (
              <p role="status" className="flex items-center gap-2 text-xs text-sky-200">
                <Clock3 size={14} aria-hidden="true" />
                Processing one document. Please keep this window open.
              </p>
            )}
          </>
        )}
        <div className="flex gap-2 rounded-lg bg-white/[.025] p-3 text-xs leading-5 text-slate-400">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#b1beb0]" aria-hidden="true" />
          <p>
            Processed locally. Original documents are discarded by the API. Each file keeps its own
            employer, pay period and review. Nothing is saved as a paycheck until you confirm it.
          </p>
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 sm:px-6">
        <p className="text-xs text-slate-500">
          {items.length
            ? `${completed} paycheck${completed === 1 ? '' : 's'} saved`
            : `${files.length} file${files.length === 1 ? '' : 's'} selected`}
        </p>
        <div className="ml-auto flex gap-2">
          <Button disabled={busy} onClick={finish}>
            {completed ? 'Finish' : items.length ? 'Close' : 'Cancel'}
          </Button>
          {!items.length && (
            <Button
              variant="primary"
              disabled={!files.length || busy}
              onClick={() => {
                if (pending.current || !files.length) return
                const queue = files.map((file) => ({
                  id: crypto.randomUUID(),
                  name: file.name,
                  file,
                  status: 'queued' as const,
                }))
                setItems(queue)
                setFiles([])
                void extract(queue[0])
              }}
            >
              {!files.length
                ? 'Review paychecks'
                : files.length === 1
                  ? 'Review paycheck'
                  : `Review ${files.length} paychecks`}
            </Button>
          )}
        </div>
      </footer>
    </Modal>
  )
}
