import { randomUUID } from 'node:crypto'
import type { PublicUser } from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { TradingRepository } from './trading.repository'

export function saveTradingBatch<T, R extends { id: string }>(
  store: TradingRepository,
  user: PublicUser,
  home: string,
  parsed: { idempotencyKey: string; values: T[] },
  action: string,
  authorize: (value: T) => void,
  save: (body: { idempotencyKey: string; values: T }) => R,
  view: (id: string) => R,
) {
  return store.atomic(() => {
    parsed.values.forEach(authorize)
    const previous = store.history(home, parsed.idempotencyKey).find((a) => a.action === action)
    if (previous) {
      const saved = JSON.parse(previous.afterJson!) as { input: unknown; record: string[] }
      if (
        previous.actorUserId !== user.id ||
        JSON.stringify(saved.input) !== JSON.stringify(parsed.values)
      )
        throw new FinancialError('Submission key already used', 409)
      return saved.record.map(view)
    }
    const records = parsed.values.map((values) => save({ idempotencyKey: randomUUID(), values }))
    store.audit(
      home,
      user.id,
      action,
      parsed.idempotencyKey,
      null,
      records.map((a) => a.id),
      parsed.values,
    )
    return records
  })
}
