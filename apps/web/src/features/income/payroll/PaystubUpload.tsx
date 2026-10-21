import { useRef, useState } from 'react'
import type { PayrollStatement, PayrollWeek, PayrollUploadPreview } from '@goxfinance/shared'
import { Modal } from '../../../components/ui/Modal'
import { Button, Input } from '../../../components/ui'
import { errorMessage, apiRequest } from '../../../lib/api'
import { encodePaystub, payrollBase } from './payrollClient'
export type PaystubPreview = {
  statement: PayrollStatement
  warnings: string[]
  documentDigest: string | null
  revision: number
}
export function PaystubUpload({
  home,
  week,
  close,
  extracted,
  uploadFirst,
}: {
  home: string
  week?: PayrollWeek
  close: () => void
  extracted?: (preview: PaystubPreview) => void
  uploadFirst?: (preview: PayrollUploadPreview) => void
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    pending = useRef(false)
  return (
    <Modal
      title={uploadFirst ? 'Upload Paycheck' : 'Upload paystub'}
      onClose={() => {
        if (!pending.current) close()
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          PDF, PNG or JPG, up to 10 MB. Processed only by your local API; original documents are
          discarded. Redact personal identifiers first.
        </p>
        <Input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          {week && (
            <Button
              disabled={busy}
              onClick={() =>
                extracted?.({
                  statement: week.statement ?? {
                    employer: null,
                    assignment: null,
                    periodStart: week.workweekStart,
                    periodEnd: week.workweekEnd,
                    payDate: week.expectedPayDate,
                    grossCents: null,
                    deductionsCents: null,
                    netCents: null,
                    lines: [],
                    acknowledgement: null,
                  },
                  warnings: ['Manual entry. Verify every field against your statement.'],
                  documentDigest: null,
                  revision: week.revision,
                })
              }
            >
              Enter manually
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!file || busy}
            onClick={async () => {
              if (!file || pending.current) return
              pending.current = true
              setBusy(true)
              setError('')
              try {
                const encoded = await encodePaystub(file)
                if (uploadFirst) {
                  uploadFirst(
                    await apiRequest<PayrollUploadPreview>(payrollBase(home) + '/upload/preview', {
                      method: 'POST',
                      body: JSON.stringify(encoded),
                    }),
                  )
                  return
                }
                if (!week) throw new Error('Select a payroll week or use Upload Paycheck')
                const preview = await apiRequest<PaystubPreview>(
                  payrollBase(home) + `/weeks/${week.id}/extract`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ ...encoded, revision: week.revision }),
                  },
                )
                extracted?.(preview)
              } catch (e) {
                setError(errorMessage(e))
              } finally {
                pending.current = false
                setBusy(false)
              }
            }}
          >
            {busy ? 'Processing locally…' : 'Extract and review'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
