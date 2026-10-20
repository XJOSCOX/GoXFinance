import { useRef, useState } from 'react'
import type { BankAccount, ImportPreview, ManualImportInput } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { FormField, Select } from '../../../components/ui/FormField'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import { ImportPreviewTable } from './ImportPreviewTable'
const emptyMapping = {
  date: '',
  amount: '',
  debit: '',
  credit: '',
  description: '',
  merchant: '',
  pending: '',
  currency: '',
  reference: '',
}
export function StatementImport({
  home,
  accounts,
  close,
  saved,
}: {
  home: string
  accounts: BankAccount[]
  close: () => void
  saved: () => void
}) {
  const [input, setInput] = useState<ManualImportInput>({
      accountId: accounts.find((a) => a.status === 'active')?.id ?? '',
      format: 'csv',
      text: '',
      dateFormat: 'iso',
      sign: 'inflow_positive',
      mapping: emptyMapping,
    }),
    [headers, setHeaders] = useState<string[]>([]),
    [preview, setPreview] = useState<ImportPreview>(),
    [selected, setSelected] = useState<number[]>([]),
    [duplicates, setDuplicates] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    pending = useRef(false),
    key = useRef(crypto.randomUUID()),
    notify = useNotify()
  function change(patch: Partial<ManualImportInput>) {
    setInput((v) => ({ ...v, ...patch }))
    setPreview(undefined)
    setError('')
    key.current = crypto.randomUUID()
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const post = <T,>(path: string, body: unknown) =>
    apiRequest<T>(`households/${home}/banking/imports/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  return (
    <Modal
      title="Import statement"
      onClose={() => {
        if (!busy) close()
      }}
      framed
      className="max-w-4xl"
    >
      <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
        <fieldset disabled={busy} className="space-y-5">
          <p className="text-sm text-slate-400">
            Preview a CSV, OFX or QFX statement. Imported rows stay in the inbox until reviewed;
            importing does not record payments or income.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Destination account">
              <Select
                value={input.accountId}
                onChange={(e) => change({ accountId: e.target.value })}
              >
                {accounts
                  .filter((a) => a.status === 'active')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Format">
              <Select
                value={input.format}
                onChange={(e) => {
                  change({
                    format: e.target.value as 'csv' | 'ofx',
                    text: '',
                    mapping: emptyMapping,
                  })
                  setHeaders([])
                }}
              >
                <option value="csv">CSV</option>
                <option value="ofx">OFX / QFX</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Statement file (maximum 500 KB)">
            <Input
              type="file"
              accept={input.format === 'csv' ? '.csv,text/csv' : '.ofx,.qfx'}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                void run(async () => {
                  if (file.size > 500000) throw new Error('Use a statement smaller than 500 KB.')
                  const text = await file.text()
                  change({ text, mapping: emptyMapping })
                  setHeaders([])
                  if (input.format === 'csv') {
                    const result = await post<{ headers: string[] }>('columns', {
                      accountId: input.accountId,
                      text,
                    })
                    setHeaders(result.headers)
                    const mapping = { ...emptyMapping }
                    for (const name of Object.keys(mapping) as (keyof typeof mapping)[])
                      mapping[name] = result.headers.find((h) => h.toLowerCase() === name) ?? ''
                    change({ text, mapping })
                  }
                })
              }}
            />
          </FormField>
          {input.format === 'csv' && headers.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(emptyMapping) as (keyof typeof emptyMapping)[]).map((name) => (
                  <FormField
                    key={name}
                    label={`${name[0].toUpperCase() + name.slice(1)} column${['date', 'description'].includes(name) ? ' *' : ''}`}
                  >
                    <Select
                      value={input.mapping[name]}
                      onChange={(e) =>
                        change({ mapping: { ...input.mapping, [name]: e.target.value } })
                      }
                    >
                      <option value="">Not mapped</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </Select>
                  </FormField>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Date format">
                  <Select
                    value={input.dateFormat}
                    onChange={(e) =>
                      change({ dateFormat: e.target.value as ManualImportInput['dateFormat'] })
                    }
                  >
                    <option value="iso">YYYY-MM-DD</option>
                    <option value="mdy">MM/DD/YYYY</option>
                    <option value="dmy">DD/MM/YYYY</option>
                  </Select>
                </FormField>
                <FormField label="Single amount column convention">
                  <Select
                    value={input.sign}
                    onChange={(e) => change({ sign: e.target.value as ManualImportInput['sign'] })}
                  >
                    <option value="inflow_positive">Positive = inflow; negative = outflow</option>
                    <option value="outflow_positive">Positive = outflow; negative = inflow</option>
                  </Select>
                </FormField>
              </div>
              <p className="text-xs text-slate-400">
                Map one amount column OR separate positive debit/credit columns. With both mapped,
                the amount column takes precedence.
              </p>
            </>
          )}
          <Button
            type="button"
            disabled={!input.text || !input.accountId}
            onClick={() =>
              void run(async () => {
                const result = await post<ImportPreview>('preview', input)
                setPreview(result)
                setSelected(
                  result.rows
                    .filter((r) => r.values && !r.duplicate && !r.possibleDuplicate)
                    .map((r) => r.index),
                )
                setDuplicates(false)
              })
            }
          >
            Preview import
          </Button>
          {preview && (
            <>
              <p className="text-sm">
                {preview.validCount} valid · {preview.invalidCount} invalid ·{' '}
                {preview.duplicateCount} already imported · {preview.possibleDuplicateCount}{' '}
                possible duplicates
              </p>
              <ImportPreviewTable preview={preview} selected={selected} setSelected={setSelected} />
              {preview.possibleDuplicateCount > 0 && (
                <label className="flex items-start gap-2 text-xs text-amber-200">
                  <input
                    type="checkbox"
                    checked={duplicates}
                    onChange={(e) => setDuplicates(e.target.checked)}
                  />
                  I reviewed the selected possible duplicates and confirm they are separate
                  transactions.
                </label>
              )}
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4">
        <Button disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy || !preview || !selected.length}
          onClick={() =>
            void run(async () => {
              const result = await post<{ imported: number }>('confirm', {
                input,
                previewHash: preview!.hash,
                selectedRows: selected,
                confirmPossibleDuplicates: duplicates,
                idempotencyKey: key.current,
              })
              notify('success', `${result.imported} transactions saved to the inbox`)
              saved()
              close()
            })
          }
        >
          {busy ? 'Working…' : `Import ${selected.length} selected`}
        </Button>
      </footer>
    </Modal>
  )
}
