import { useRef, useState } from 'react'
import { UploadCloud, FileText, X } from 'lucide-react'
import { Button } from '../../../components/ui'
import { addPaystubFiles, paystubFileKey } from './paystub-files'
export function PaystubFilePicker({
  files,
  change,
  disabled = false,
  multiple = false,
}: {
  files: File[]
  change: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
}) {
  const input = useRef<HTMLInputElement>(null),
    [error, setError] = useState(''),
    [drag, setDrag] = useState(false)
  function add(incoming: File[]) {
    if (disabled) return
    const result = addPaystubFiles(files, incoming, multiple)
    change(result.files)
    setError(result.error)
  }
  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(Array.from(e.dataTransfer.files))
        }}
        className={`rounded-xl border border-dashed px-5 py-7 text-center transition ${drag ? 'border-sky-300 bg-sky-300/10' : 'border-[#a9b8a9]/30 bg-[#a9b8a9]/[.035]'}`}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#a9b8a9]/10 text-[#b1beb0]">
          <UploadCloud size={24} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium">
          Drop {multiple ? 'your paychecks' : 'a paycheck'} here
        </p>
        <p className="mt-1 text-xs text-slate-400">
          PDF, PNG or JPG · up to 10 MB each{multiple ? ' · up to 10 files' : ''}
        </p>
        <input
          ref={input}
          type="file"
          aria-label={multiple ? 'Choose paycheck files' : 'Choose paycheck file'}
          accept="application/pdf,image/png,image/jpeg"
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <Button
          className="mt-4"
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {files.length
            ? multiple
              ? 'Choose more files'
              : 'Replace file'
            : multiple
              ? 'Choose files'
              : 'Choose file'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="max-h-44 space-y-2 overflow-y-auto" aria-label="Selected paycheck files">
          {files.map((file) => (
            <li
              key={paystubFileKey(file)}
              className="flex items-center gap-3 rounded-lg border border-white/10 p-3"
            >
              <FileText size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#a9b8a9]"
                onClick={() => change(files.filter((f) => f !== file))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
