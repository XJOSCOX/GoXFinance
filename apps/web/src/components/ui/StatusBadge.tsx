import { statusTone, toneStyles, type SemanticTone } from './semantic-tones'
import { cn } from '../../lib/utils'

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string
  label?: string
  tone?: SemanticTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize',
        toneStyles[tone ?? statusTone(status)].badge,
        className,
      )}
    >
      {label ?? status.replaceAll('_', ' ')}
    </span>
  )
}
