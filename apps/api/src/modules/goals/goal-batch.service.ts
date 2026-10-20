import { randomUUID } from 'node:crypto'
import {
  createTradingSchema,
  editTradingSchema,
  goalAccountBatchSchema,
  type GoalInput,
  type PublicUser,
  type TradingAccount,
} from '@goxfinance/shared'
import type { GoalRepository } from './goal.repository'
import { FinancialError } from '../households/financial-access'

export function saveGoalBatch<R extends { id: string }>(
  store: GoalRepository,
  user: PublicUser,
  home: string,
  body: unknown,
  accounts: TradingAccount[],
  save: (body: unknown, id?: string) => R,
) {
  const parsed = createTradingSchema(goalAccountBatchSchema)
    .or(editTradingSchema(goalAccountBatchSchema))
    .parse(body)
  return store.atomic(() => {
    const editing = parsed.values.accounts.some((a) => a.goalId)
    const correction = 'reason' in parsed
    if (editing !== correction)
      throw new FinancialError('Use the matching create or correction workflow', 400)
    const targets = parsed.values.accounts.map((target) => {
      const account = accounts.find((a) => a.id === target.accountId && !a.deletedAt)
      if (!account) throw new FinancialError('Selected trading account is unavailable', 400)
      if (target.goalId) {
        const goal = store.goals(home).find((g) => g.id === target.goalId)
        if (!goal || goal.tradingAccountId !== account.id)
          throw new FinancialError('Goal does not match selected account', 400)
      }
      const values: GoalInput = {
        ...parsed.values.template,
        name: parsed.values.template.name + ' · ' + account.nickname,
        tradingAccountId: account.id,
      }
      if (values.name.length > 160)
        throw new FinancialError('Use a shorter goal name for account labels', 400)
      return { target, values }
    })
    // Existing goal/account permissions are rechecked by the ordinary save service.
    const prior =
      'idempotencyKey' in parsed
        ? store.history(home, parsed.idempotencyKey).find((a) => a.action === 'goals_batch_created')
        : undefined
    if (prior) {
      const saved = JSON.parse(prior.afterJson ?? '{}') as { input: unknown; record: string[] }
      if (
        prior.actorUserId !== user.id ||
        JSON.stringify(saved.input) !== JSON.stringify(parsed.values)
      )
        throw new FinancialError('Submission key already used', 409)
      return saved.record.map((id) => {
        const record = store.goals(home).find((g) => g.id === id)
        if (!record) throw new FinancialError('Previously created goal is unavailable', 409)
        return record
      })
    }
    const records = targets.map(({ target, values }) =>
      save(
        editing
          ? { revision: target.revision, reason: 'reason' in parsed ? parsed.reason : '', values }
          : { idempotencyKey: randomUUID(), values },
        target.goalId,
      ),
    )
    store.audit(
      home,
      user.id,
      editing ? 'goals_batch_corrected' : 'goals_batch_created',
      'idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID(),
      null,
      records.map((r) => r.id),
      parsed.values,
    )
    return records
  })
}
