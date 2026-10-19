import { randomUUID } from 'node:crypto'
import {
  tradingAccountSchema,
  tradingResultSchema,
  tradingSessionDate,
  createTradingSchema,
  editTradingSchema,
  type PublicUser,
  type TradingAccount,
  type TradingResult,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import { checkRevision, type TradingPermissions } from './trading.permissions'
import type { TradingRepository } from './trading.repository'
export function tradingService(store: TradingRepository, permissions: TradingPermissions) {
  function account(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const row = store.accounts(home).find((a) => a.id === id)
    if (!row) throw new FinancialError('Trading account not found', 404)
    return row
  }
  function accountView(
    user: PublicUser,
    home: string,
    row: ReturnType<typeof account>,
  ): TradingAccount {
    return {
      ...row,
      canManage: permissions.canManage(user, home, row.responsibleMemberId),
      ruleSnapshots: store
        .rules(home, row.id)
        .map((r) => ({ ...JSON.parse(r.rulesJson), id: r.id, createdAt: r.createdAt })),
    } as TradingAccount
  }
  function results(user: PublicUser, home: string): TradingResult[] {
    permissions.context(user, home)
    const canManage = (id: string) =>
      permissions.canManage(user, home, account(user, home, id).responsibleMemberId)
    const copied = store.copyResults(home).map(({ row, event }) => ({
      ...row,
      copyEventId: event.id,
      sessionAt: event.sessionAt,
      notes: event.notes,
      tradeCount: null,
      revision: event.revision,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      canManage: false,
    }))
    return [
      ...store.results(home).map((r) => ({ ...r, canManage: canManage(r.accountId) })),
      ...copied,
    ] as TradingResult[]
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
    account,
    accountView,
    results,
    replay,
    canCreate(user: PublicUser, home: string) {
      const ctx = permissions.context(user, home)
      return ctx.role !== 'viewer' && (ctx.role === 'owner' || !!ctx.self)
    },
    accounts(user: PublicUser, home: string) {
      permissions.context(user, home)
      return store.accounts(home).map((r) => accountView(user, home, r))
    },
    saveAccount(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
          ? editTradingSchema(tradingAccountSchema).parse(body)
          : createTradingSchema(tradingAccountSchema).parse(body)
        const values = parsed.values,
          old = id ? account(user, home, id) : undefined
        permissions.manage(
          user,
          home,
          old?.responsibleMemberId ?? values.responsibleMemberId,
          !!old,
        )
        permissions.manage(
          user,
          home,
          values.responsibleMemberId,
          old?.responsibleMemberId === values.responsibleMemberId,
        )
        if ('idempotencyKey' in parsed) {
          const previous = store
            .accounts(home)
            .find((a) => a.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, values)) return accountView(user, home, previous!)
        }
        if (old) {
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
          if (
            old.responsibleMemberId !== values.responsibleMemberId &&
            (results(user, home).some((r) => r.accountId === id) ||
              store.payouts(home).some((p) => p.accountId === id))
          )
            throw new FinancialError('Accounts with history cannot be reassigned', 409)
        }
        const { ruleSnapshot, ...fields } = values,
          now = new Date().toISOString()
        const row = {
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
        store.writeAccount(row, !!old)
        if (ruleSnapshot) store.addRule(home, row.id, ruleSnapshot)
        store.audit(
          home,
          user.id,
          old ? 'account_corrected' : 'account_created',
          row.id,
          old,
          row,
          parsed.values,
        )
        return accountView(user, home, account(user, home, row.id))
      })
    },
    saveResult(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
            ? editTradingSchema(tradingResultSchema).parse(body)
            : createTradingSchema(tradingResultSchema).parse(body),
          values = parsed.values
        const parent = account(user, home, values.accountId)
        permissions.manage(user, home, parent.responsibleMemberId, true)
        const old = id ? store.results(home).find((r) => r.id === id) : undefined
        if (id && !old) throw new FinancialError('Daily result not found', 404)
        if (old) {
          if (old.accountId !== values.accountId)
            throw new FinancialError('Historical account cannot change', 409)
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
        }
        if ('idempotencyKey' in parsed) {
          const previous = store
            .results(home)
            .find((r) => r.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, values)) return previous
        }
        const timezone = old?.timezone ?? parent.timezone,
          sessionStart = old?.sessionStart ?? parent.sessionStart
        const sessionDate = tradingSessionDate(values.sessionAt, timezone, sessionStart)
        if (Date.parse(values.sessionAt) > Date.now())
          throw new FinancialError('Future realized results cannot be recorded', 400)
        if (
          store
            .results(home)
            .some(
              (r) => r.id !== id && r.accountId === parent.id && r.sessionDate === sessionDate,
            ) ||
          store
            .copyResults(home)
            .some((r) => r.row.accountId === parent.id && r.row.sessionDate === sessionDate)
        )
          throw new FinancialError(
            'This session already has results. Correct its existing summary or copied events.',
            409,
          )
        const now = new Date().toISOString(),
          row = {
            ...old,
            ...values,
            id: id ?? randomUUID(),
            householdId: home,
            sessionDate,
            timezone,
            sessionStart,
            netCents: values.grossCents - values.feesCents,
            createdByUserId: old?.createdByUserId ?? user.id,
            idempotencyKey:
              old?.idempotencyKey ??
              ('idempotencyKey' in parsed ? parsed.idempotencyKey : randomUUID()),
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
            revision: (old?.revision ?? 0) + 1,
          }
        store.writeResult(row, !!old)
        store.audit(
          home,
          user.id,
          old ? 'result_corrected' : 'result_created',
          row.id,
          old,
          row,
          values,
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
export type TradingService = ReturnType<typeof tradingService>
