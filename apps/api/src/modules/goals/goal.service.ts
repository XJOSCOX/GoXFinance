import { randomUUID } from 'node:crypto'
import {
  goalSchema,
  tradingSessionDate,
  reportedTradingDate,
  goalContributionSchema,
  goalEndDate,
  goalWindows,
  goalProgress,
  createTradingSchema,
  editTradingSchema,
  localBillDate,
  type GoalInput,
  type Goal,
  type GoalContribution,
  type GoalSources,
  type PublicUser,
} from '@goxfinance/shared'
import type { TradingPermissions } from '../trading/trading.permissions'
import { checkRevision } from '../trading/trading.permissions'
import { FinancialError } from '../households/financial-access'
import type { GoalRepository } from './goal.repository'
export function goalService(
  store: GoalRepository,
  permissions: TradingPermissions,
  sources: (user: PublicUser, home: string) => Omit<GoalSources, 'contributions'>,
) {
  function find(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const row = store.goals(home).find((g) => g.id === id)
    if (!row) throw new FinancialError('Goal not found', 404)
    return row
  }
  function replay(
    home: string,
    actor: string,
    old: { id: string; createdByUserId: string } | undefined,
    input: unknown,
  ) {
    if (!old) return false
    const original = store.history(home, old.id).find((a) => a.action.endsWith('_created'))
    if (
      old.createdByUserId !== actor ||
      JSON.stringify(JSON.parse(original?.afterJson ?? '{}').input) !== JSON.stringify(input)
    )
      throw new FinancialError('Submission key already used', 409)
    return true
  }
  return {
    list(user: PublicUser, home: string) {
      const ctx = permissions.context(user, home),
        data = sources(user, home),
        today = localBillDate()
      const contributions = store.contributions(home).map((c) => ({
        ...c,
        canManage: permissions.canManage(
          user,
          home,
          find(user, home, c.goalId).responsibleMemberId,
        ),
      })) as GoalContribution[]
      return {
        goals: store.goals(home).map((row) => {
          const goal = row as typeof row & GoalInput
          const reported = data.results.some(
            (r) =>
              r.reportedDate &&
              (!goal.tradingAccountId || r.accountId === goal.tradingAccountId) &&
              (!goal.copyGroupId ||
                data.events.some(
                  (e) => e.id === r.copyEventId && e.groupId === goal.copyGroupId,
                )) &&
              (!goal.responsibleMemberId ||
                data.accounts.some(
                  (a) => a.id === r.accountId && a.responsibleMemberId === goal.responsibleMemberId,
                )),
          )
          const asOf =
            ['trading_profit', 'trading_loss'].includes(goal.goalType) &&
            goal.timezone &&
            goal.sessionStart
              ? (reported ? reportedTradingDate : tradingSessionDate)(
                  new Date().toISOString(),
                  goal.timezone,
                  goal.sessionStart,
                )
              : today
          const history = goalWindows(goal, asOf).map((w) =>
            goalProgress(goal, w, { ...data, contributions }, asOf),
          )
          return {
            ...goal,
            canManage: permissions.canManage(user, home, row.responsibleMemberId),
            history,
            progress: history[0],
          }
        }) as Goal[],
        contributions,
        canCreate: ctx.role !== 'viewer' && (ctx.role === 'owner' || !!ctx.self),
      }
    },
    save(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
            ? editTradingSchema(goalSchema).parse(body)
            : createTradingSchema(goalSchema).parse(body),
          v = parsed.values,
          old = id ? find(user, home, id) : undefined
        permissions.manage(user, home, old?.responsibleMemberId ?? v.responsibleMemberId, !!old)
        permissions.manage(
          user,
          home,
          v.responsibleMemberId,
          old?.responsibleMemberId === v.responsibleMemberId,
        )
        if (old) {
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
          if (
            store.contributions(home).some((c) => c.goalId === id) &&
            (old.goalType !== v.goalType || old.responsibleMemberId !== v.responsibleMemberId)
          )
            throw new FinancialError(
              'Goals with contributions cannot change measurement type or responsible member',
              409,
            )
        }
        if ('idempotencyKey' in parsed) {
          const previous = store.goals(home).find((g) => g.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, v)) return previous
        }
        if (v.period !== 'custom' && v.endDate !== goalEndDate(v.startDate, v.period))
          throw new FinancialError('Use the calculated first-period end date', 400)
        const data = sources(user, home)
        if (v.tradingAccountId) {
          const account = data.accounts.find((a) => a.id === v.tradingAccountId)
          if (
            !account ||
            (v.responsibleMemberId && account.responsibleMemberId !== v.responsibleMemberId)
          )
            throw new FinancialError('Select an account matching the goal member', 400)
        }
        if (v.copyGroupId && !data.groups.some((g) => g.id === v.copyGroupId))
          throw new FinancialError('Copy group not found', 400)
        if (
          ['trading_profit', 'trading_loss'].includes(v.goalType) &&
          (!v.timezone || !v.sessionStart)
        )
          throw new FinancialError(
            'Choose the goal trading timezone and session start boundary',
            400,
          )
        const now = new Date().toISOString(),
          row = {
            ...old,
            ...v,
            id: id ?? randomUUID(),
            householdId: home,
            createdByUserId: old?.createdByUserId ?? user.id,
            idempotencyKey:
              old?.idempotencyKey ??
              ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
            revision: (old?.revision ?? 0) + 1,
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
          }
        store.writeGoal(row, !!old)
        store.audit(home, user.id, old ? 'goal_corrected' : 'goal_created', row.id, old, row, v)
        return row
      })
    },
    contribute(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
            ? editTradingSchema(goalContributionSchema).parse(body)
            : createTradingSchema(goalContributionSchema).parse(body),
          v = parsed.values,
          goal = find(user, home, v.goalId)
        permissions.manage(user, home, goal.responsibleMemberId, true)
        if (!['savings', 'manual'].includes(goal.goalType))
          throw new FinancialError(
            'This goal uses automatic source records, not manual contributions',
            400,
          )
        if (v.date > localBillDate())
          throw new FinancialError('Future contributions are not recorded savings', 400)
        const old = id ? store.contributions(home).find((c) => c.id === id) : undefined
        if (id && !old) throw new FinancialError('Contribution not found', 404)
        if (old) {
          if (old.goalId !== v.goalId)
            throw new FinancialError('Contribution goal cannot change', 409)
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
        }
        if ('idempotencyKey' in parsed) {
          const previous = store
            .contributions(home)
            .find((c) => c.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, v)) return previous
        }
        const now = new Date().toISOString(),
          row = {
            ...old,
            ...v,
            id: id ?? randomUUID(),
            householdId: home,
            createdByUserId: old?.createdByUserId ?? user.id,
            idempotencyKey:
              old?.idempotencyKey ??
              ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
            revision: (old?.revision ?? 0) + 1,
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
          }
        store.writeContribution(row, !!old)
        store.audit(
          home,
          user.id,
          old ? 'contribution_corrected' : 'contribution_created',
          row.id,
          old,
          row,
          v,
        )
        return row
      })
    },
    history(user: PublicUser, home: string, id: string) {
      permissions.context(user, home)
      return store.history(home, id)
    },
  }
}
export type GoalService = ReturnType<typeof goalService>
