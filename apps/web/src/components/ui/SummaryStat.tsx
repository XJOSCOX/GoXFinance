import { Card } from './index'
import { toneStyles, type SemanticTone } from './semantic-tones'
export function SummaryStat({
  label,
  amount,
  detail,
  tone = 'default',
  compact = false,
}: {
  label: string
  amount: string
  detail?: string
  tone?: 'default' | SemanticTone
  compact?: boolean
}) {
  const color = toneStyles[tone === 'default' ? 'neutral' : tone]
  return (
    <Card className={`${compact ? 'min-w-0 p-3' : 'min-w-0 p-5'} border-t-2 ${color.border}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={`${compact ? 'mt-2 text-xl' : 'mt-4 text-2xl'} font-semibold tabular-nums ${color.text}`}
      >
        {amount}
      </p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </Card>
  )
}
