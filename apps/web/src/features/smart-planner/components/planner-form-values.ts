import type { ForecastSources, PlannerTarget } from '@goxfinance/shared'
import { text } from '../../../lib/financial-entry'
export function readTarget(f: FormData, s: ForecastSources): PlannerTarget | null {
  const raw = text(f, 'target')
  if (!raw) return null
  const [kind, id] = raw.split(':')
  return {
    kind: kind as PlannerTarget['kind'],
    id,
    parentId:
      kind === 'bill_period'
        ? (s.bills.find((b) => b.periods.some((p) => p.id === id))?.id ?? null)
        : null,
  }
}
export function readVerification(f: FormData) {
  return {
    verified: f.has('verified'),
    source: text(f, 'proof'),
    verifiedAt: text(f, 'verifiedAt') ? new Date(text(f, 'verifiedAt')).toISOString() : null,
    validThrough: text(f, 'validThrough') || null,
  }
}
export function readLinks(f: FormData, name: string) {
  return f.getAll(name).map((v) => {
    const [kind, id] = String(v).split(':')
    return { kind: kind as 'bill' | 'debt', id }
  })
}
