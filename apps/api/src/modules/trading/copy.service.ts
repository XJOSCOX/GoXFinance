import { randomUUID } from 'node:crypto'
import {
  copyGroupSchema,
  copyEventSchema,
  createTradingSchema,
  editTradingSchema,
  tradingSessionDate,
  type PublicUser,
  type CopyGroup,
  type CopyEvent,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { TradingRepository } from './trading.repository'
import type { TradingService } from './trading.service'
import type { CopyRepository } from './copy.repository'
import { checkRevision, type TradingPermissions } from './trading.permissions'
export function copyService(
  store: CopyRepository,
  trades: TradingRepository,
  trading: TradingService,
  permissions: TradingPermissions,
) {
  const manage = (user: PublicUser, home: string, ids: string[]) =>
    ids.forEach((id) =>
      permissions.manage(user, home, trading.account(user, home, id).responsibleMemberId, true),
    )
  const canManage = (user: PublicUser, home: string, ids: string[]) =>
    ids.every((id) =>
      permissions.canManage(user, home, trading.account(user, home, id).responsibleMemberId),
    )
  return {
    list(user: PublicUser, home: string) {
      permissions.context(user, home)
      return {
        groups: store.groups(home).map((g) => ({
          ...g,
          canManage: canManage(
            user,
            home,
            g.members.map((m) => m.accountId),
          ),
        })) as CopyGroup[],
        events: store.events(home).map((e) => ({
          ...e,
          canManage: canManage(
            user,
            home,
            e.entries.map((r) => r.accountId),
          ),
        })) as CopyEvent[],
        batches: store.batches(home),
      }
    },
    saveGroup(user: PublicUser, home: string, body: unknown, id?: string) {
      return trades.atomic(() => {
        const parsed = id
            ? editTradingSchema(copyGroupSchema).parse(body)
            : createTradingSchema(copyGroupSchema).parse(body),
          v = parsed.values
        permissions.context(user, home)
        manage(
          user,
          home,
          v.members.map((m) => m.accountId),
        )
        const old = id ? store.groups(home).find((g) => g.id === id) : undefined
        if (id && !old) throw new FinancialError('Copy group not found', 404)
        if (old) {
          manage(
            user,
            home,
            old.members.map((m) => m.accountId),
          )
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
        }
        if ('idempotencyKey' in parsed) {
          const previous = store
            .groups(home)
            .find((g) => g.idempotencyKey === parsed.idempotencyKey)
          if (trading.replay(home, user.id, previous, v)) return previous
        }
        const { members, ...fields } = v,
          now = new Date().toISOString(),
          row = {
            ...old,
            ...fields,
            id: id ?? randomUUID(),
            householdId: home,
            createdByUserId: old?.createdByUserId ?? user.id,
            idempotencyKey:
              old?.idempotencyKey ??
              ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
            revision: (old?.revision ?? 0) + 1,
          }
        store.writeGroup(row, members, !!old)
        trades.audit(
          home,
          user.id,
          old ? 'group_corrected' : 'group_created',
          row.id,
          old,
          { ...row, members },
          v,
        )
        return { ...row, members }
      })
    },
    saveEvent(user: PublicUser, home: string, body: unknown, id?: string) {
      return trades.atomic(() => {
        const parsed = id
            ? editTradingSchema(copyEventSchema).parse(body)
            : createTradingSchema(copyEventSchema).parse(body),
          v = parsed.values
        permissions.context(user, home)
        const old = id ? store.events(home).find((e) => e.id === id) : undefined
        if (id && !old) throw new FinancialError('Copied event not found', 404)
        const group = old?.membershipSnapshot ?? store.groups(home).find((g) => g.id === v.groupId)
        if (!group || (!old && group.status !== 'active'))
          throw new FinancialError('Select an active copy group', 400)
        if (old) {
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
          if (
            old.groupId !== v.groupId ||
            old.entries
              .map((e) => e.accountId)
              .sort()
              .join() !==
              v.entries
                .map((e) => e.accountId)
                .sort()
                .join()
          )
            throw new FinancialError(
              'Historical event membership cannot change; correct the recorded account values',
              409,
            )
        }
        if (
          !v.entries.some((e) => e.accountId === group.leadAccountId) ||
          v.entries.some((e) => !group.members.some((m) => m.accountId === e.accountId))
        )
          throw new FinancialError(
            'Include the lead and select accounts from the group snapshot',
            400,
          )
        manage(
          user,
          home,
          v.entries.map((e) => e.accountId),
        )
        if ('idempotencyKey' in parsed) {
          const previous = store
            .events(home)
            .find((e) => e.idempotencyKey === parsed.idempotencyKey)
          if (trading.replay(home, user.id, previous, v)) return previous
        }
        if (Date.parse(v.sessionAt) > Date.now())
          throw new FinancialError('Future realized results cannot be recorded', 400)
        const target = id ?? randomUUID(),
          now = new Date().toISOString()
        const entries = v.entries.map((entry) => {
          const account = trading.account(user, home, entry.accountId),
            previous = old?.entries.find((e) => e.accountId === entry.accountId),
            timezone = previous?.timezone ?? account.timezone,
            sessionStart = previous?.sessionStart ?? account.sessionStart,
            sessionDate = tradingSessionDate(v.sessionAt, timezone, sessionStart)
          if (
            trades
              .results(home)
              .some((r) => r.accountId === entry.accountId && r.sessionDate === sessionDate) ||
            trades
              .copyResults(home)
              .some(
                (r) =>
                  r.row.eventId !== id &&
                  r.row.accountId === entry.accountId &&
                  r.row.sessionDate === sessionDate &&
                  (v.mode === 'daily' || r.event.mode === 'daily'),
              )
          )
            throw new FinancialError(
              'A daily summary cannot overlap manual or trade-level results for the same account session',
              409,
            )
          return {
            ...entry,
            id: previous?.id ?? randomUUID(),
            householdId: home,
            eventId: target,
            timezone,
            sessionStart,
            sessionDate,
            netCents: entry.grossCents - entry.feesCents,
          }
        })
        const { entries: _entries, ...fields } = v
        void _entries
        const row = {
          ...fields,
          id: target,
          householdId: home,
          membershipJson: JSON.stringify(group),
          createdByUserId: old?.createdByUserId ?? user.id,
          idempotencyKey:
            old?.idempotencyKey ??
            ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
          revision: (old?.revision ?? 0) + 1,
        }
        store.writeEvent(row, entries, !!old)
        trades.audit(
          home,
          user.id,
          old ? 'event_corrected' : 'event_created',
          target,
          old,
          { ...row, entries },
          v,
        )
        return { ...row, entries }
      })
    },
  }
}
export type CopyService = ReturnType<typeof copyService>
