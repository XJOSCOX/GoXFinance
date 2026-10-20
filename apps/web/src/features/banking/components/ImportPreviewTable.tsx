import type { ImportPreview } from '@goxfinance/shared'
import { BankAmount } from './BankAmount'
export function ImportPreviewTable({
  preview,
  selected,
  setSelected,
}: {
  preview: ImportPreview
  selected: number[]
  setSelected: (rows: number[]) => void
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[#222523]">
          <tr>
            <th className="p-3">Import</th>
            <th className="p-3">Date / description</th>
            <th className="p-3 text-right">Amount</th>
            <th className="p-3">Review</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((r) => (
            <tr className="border-t border-white/10" key={r.index}>
              <td className="p-3">
                <input
                  type="checkbox"
                  aria-label={`Import row ${r.index + 1}`}
                  disabled={!r.values || r.duplicate}
                  checked={selected.includes(r.index)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.index]
                        : selected.filter((i) => i !== r.index),
                    )
                  }
                />
              </td>
              <td className="max-w-xs p-3">
                <span className="text-slate-400">{r.values?.date ?? `Row ${r.index + 1}`}</span>
                <p className="mt-1 break-words">{r.values?.description ?? r.error}</p>
              </td>
              <td className="whitespace-nowrap p-3 text-right">
                {r.values && (
                  <BankAmount cents={r.values.amountCents} currency={r.values.currency} />
                )}
              </td>
              <td className="p-3 text-slate-400">
                {r.duplicate
                  ? 'Already imported'
                  : r.possibleDuplicate
                    ? 'Possible duplicate — check'
                    : r.values?.pending
                      ? 'Pending · no accounting'
                      : r.values
                        ? 'Unreviewed'
                        : 'Invalid'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
