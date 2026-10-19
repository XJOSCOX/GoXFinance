export function ValueComparison({
  rows,
}: {
  rows: { label: string; before: string; after: string }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="p-2 font-medium">Field</th>
            <th className="p-2 font-medium">Original</th>
            <th className="p-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-white/[.06]">
              <th className="p-2 font-normal text-slate-400">{row.label}</th>
              <td className="max-w-56 break-words p-2">{row.before}</td>
              <td className="max-w-56 break-words p-2 text-[#bfcebd]">{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
