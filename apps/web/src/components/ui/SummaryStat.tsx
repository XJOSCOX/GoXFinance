import { Card } from './index'
export function SummaryStat({
  label,
  amount,
  detail,
}: {
  label: string
  amount: string
  detail?: string
}) {
  return (
    <Card className="min-w-0 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-4 text-2xl font-semibold tabular-nums">{amount}</p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </Card>
  )
}
