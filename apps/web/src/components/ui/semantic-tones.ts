export type SemanticTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info'

export const toneStyles: Record<
  SemanticTone,
  { text: string; badge: string; border: string; bar: string; accent: string }
> = {
  neutral: {
    text: 'text-[var(--status-neutral)]',
    badge: 'border-white/15 bg-white/5 text-[var(--status-neutral)]',
    border: 'border-white/10',
    bar: 'bg-[var(--status-neutral)]',
    accent: 'accent-[var(--status-neutral)]',
  },
  positive: {
    text: 'text-[var(--status-positive)]',
    badge: 'border-emerald-300/25 bg-emerald-300/10 text-[var(--status-positive)]',
    border: 'border-emerald-300/25',
    bar: 'bg-[var(--status-positive)]',
    accent: 'accent-[var(--status-positive)]',
  },
  warning: {
    text: 'text-[var(--status-warning)]',
    badge: 'border-amber-300/25 bg-amber-300/10 text-[var(--status-warning)]',
    border: 'border-amber-300/25',
    bar: 'bg-[var(--status-warning)]',
    accent: 'accent-[var(--status-warning)]',
  },
  negative: {
    text: 'text-[var(--status-negative)]',
    badge: 'border-rose-300/25 bg-rose-300/10 text-[var(--status-negative)]',
    border: 'border-rose-300/25',
    bar: 'bg-[var(--status-negative)]',
    accent: 'accent-[var(--status-negative)]',
  },
  info: {
    text: 'text-[var(--status-info)]',
    badge: 'border-sky-300/25 bg-sky-300/10 text-[var(--status-info)]',
    border: 'border-sky-300/25',
    bar: 'bg-[var(--status-info)]',
    accent: 'accent-[var(--status-info)]',
  },
}

export function statusTone(status: string): SemanticTone {
  const value = status.toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ').trim()
  if (
    [
      'failed',
      'rejected',
      'defaulted',
      'overdue',
      'past due',
      'collections',
      'collection',
      'charged off',
      'charge off',
      'limit exceeded',
    ].includes(value) ||
    value.includes('late')
  )
    return 'negative'
  if (
    [
      'pending',
      'requested',
      'proposed',
      'negotiating',
      'unverified',
      'unknown',
      'partially paid',
      'partial',
      'unpaid',
      'incomplete',
    ].includes(value)
  )
    return 'warning'
  if (['scheduled', 'estimated', 'expected', 'approved', 'overpaid', 'credited'].includes(value))
    return 'info'
  if (
    [
      'active',
      'current',
      'paid',
      'completed',
      'confirmed',
      'accepted',
      'passed',
      'target met',
    ].includes(value)
  )
    return 'positive'
  return 'neutral'
}

export function amountTone(amount: number | null | undefined): SemanticTone {
  return amount == null || amount === 0 ? 'neutral' : amount < 0 ? 'negative' : 'positive'
}
