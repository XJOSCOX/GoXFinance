import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  tradingAccountSchema,
  tradingResultBatchSchema,
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
import { createAccounts } from './account-batch.service'
import { updateAccountRules, correctAccountRule } from './account-rules.service'
import { promoteCombine } from './combine-promotion.service'
import { saveTradingBatch } from './trading-batch'
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
    promotions = store.promotions(home),
  ): TradingAccount {
    return {
      ...row,
      sourceCombineAccountId:
        promotions.find((p) => p.targetAccountId === row.id)?.sourceAccountId ?? null,
      promotedToAccountId:
        promotions.find((p) => p.sourceAccountId === row.id)?.targetAccountId ?? null,
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
      const promotions = store.promotions(home)
      return store.accounts(home).map((r) => accountView(user, home, r, promotions))
    },
    setAccountDeleted(user: PublicUser, home: string, id: string, body: unknown, deleted: boolean) {
      return store.atomic(() => {
        const input = z
          .object({ revision: z.number().int().positive(), permanent: z.boolean().optional() })
          .strict()
          .parse(body)
        const old = account(user, home, id)
        permissions.manage(user, home, old.responsibleMemberId, true)
        checkRevision(old.revision, input.revision)
        if (input.permanent) {
          if (!deleted)
            throw new FinancialError('Permanent deletion is not a restore operation', 400)
          if (old.incomeSourceId || store.hasAccountHistory(home, id))
            throw new FinancialError(
              'This account has linked history. Hide it instead to preserve financial records.',
              409,
            )
          store.removeAccount(home, id)
          store.audit(home, user.id, 'account_permanently_deleted', id, old, null)
          store.audit(home, user.id, 'account_submission_retired', old.idempotencyKey, null, { id })
          return null
        }
        if (!!old.deletedAt === deleted) return accountView(user, home, old)
        const now = new Date().toISOString()
        const row = {
          ...old,
          deletedAt: deleted ? now : null,
          updatedAt: now,
          revision: old.revision + 1,
        }
        store.writeAccount(row, true)
        store.audit(home, user.id, deleted ? 'account_deleted' : 'account_restored', id, old, row)
        return accountView(user, home, row)
      })
    },
    saveAccounts(user: PublicUser, home: string, body: unknown): TradingAccount[] {
      return createAccounts(
        store,
        permissions,
        user,
        home,
        body,
        (entry) => this.saveAccount(user, home, entry),
        (id) => {
          const row = account(user, home, id)
          permissions.manage(user, home, row.responsibleMemberId, true)
          return accountView(user, home, row)
        },
      )
    },
    saveAccountRules(user: PublicUser, home: string, body: unknown): TradingAccount[] {
      return updateAccountRules(
        { store, permissions, account, accountView, saveAccount: this.saveAccount },
        user,
        home,
        body,
      )
    },
    correctRule(
      user: PublicUser,
      home: string,
      id: string,
      ruleId: string,
      body: unknown,
    ): TradingAccount {
      return correctAccountRule(
        { store, permissions, account, accountView, saveAccount: this.saveAccount },
        user,
        home,
        id,
        ruleId,
        body,
      )
    },
    saveAccount(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
          ? editTradingSchema(tradingAccountSchema).parse(body)
          : createTradingSchema(tradingAccountSchema).parse(body)
        const values = parsed.values,
          old = id ? account(user, home, id) : undefined
        if (old?.deletedAt) throw new FinancialError('Restore this account before editing it', 409)
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
          if (
            store
              .history(home, parsed.idempotencyKey)
              .some((a) => a.action === 'account_submission_retired')
          )
            throw new FinancialError(
              'This submission was permanently deleted. Start a new account entry.',
              409,
            )
          const previous = store
            .accounts(home)
            .find((a) => a.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, values)) return accountView(user, home, previous!)
        }
        if (old) {
          if (old.stage !== 'combine' && values.stage === 'combine')
            throw new FinancialError('Funded accounts cannot be changed back to a Combine', 409)
          if (old.stage === 'combine' && values.stage !== 'combine')
            throw new FinancialError('Use Promote to XFA to preserve Combine history', 409)
          const linked = store
            .promotions(home)
            .find((p) => p.sourceAccountId === old.id || p.targetAccountId === old.id)
          if (
            linked &&
            (old.responsibleMemberId !== values.responsibleMemberId ||
              (linked.sourceAccountId === old.id && values.status !== 'passed'))
          )
            throw new FinancialError('Keep the linked owner and passed Combine history intact', 409)
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
        if (ruleSnapshot?.supersedesRuleId) {
          const snapshots = old ? store.rules(home, old.id) : []
          if (!snapshots.some((r) => r.id === ruleSnapshot.supersedesRuleId))
            throw new FinancialError('Rule not found for this account', 404)
          if (
            snapshots.some(
              (r) => JSON.parse(r.rulesJson).supersedesRuleId === ruleSnapshot.supersedesRuleId,
            )
          )
            throw new FinancialError(
              'This rule was already edited. Refresh before editing it again.',
              409,
            )
        }
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
        if (ruleSnapshot) {
          const previous = ruleSnapshot.supersedesRuleId
            ? store.rules(home, row.id).find((r) => r.id === ruleSnapshot.supersedesRuleId)
            : undefined
          const saved = store.addRule(home, row.id, ruleSnapshot)
          if (previous)
            store.audit(
              home,
              user.id,
              'rule_corrected',
              previous.id,
              { ...JSON.parse(previous.rulesJson), id: previous.id },
              { ...ruleSnapshot, id: saved.id, createdAt: saved.createdAt },
              ruleSnapshot,
            )
        }
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
    promoteCombine(user: PublicUser, home: string, id: string, body: unknown) {
      return promoteCombine(store, permissions, user, home, id, body, (entry) =>
        this.saveAccount(user, home, entry),
      )
    },
    saveResult(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        const parsed = id
            ? editTradingSchema(tradingResultSchema).parse(body)
            : createTradingSchema(tradingResultSchema).parse(body),
          values = parsed.values
        const parent = account(user, home, values.accountId)
        permissions.manage(user, home, parent.responsibleMemberId, true)
        if (parent.deletedAt && !id)
          throw new FinancialError('Restore this account before adding results', 409)
        const old = id ? store.results(home).find((r) => r.id === id) : undefined
        if (id && !old) throw new FinancialError('Daily result not found', 404)
        if (old) {
          if (old.accountId !== values.accountId)
            throw new FinancialError('Historical account cannot change', 409)
          checkRevision(old.revision, 'revision' in parsed ? parsed.revision : 0)
        }
        if ('idempotencyKey' in parsed) {
          if (
            store
              .history(home, parsed.idempotencyKey)
              .some((a) => a.action === 'result_submission_retired')
          )
            throw new FinancialError('This submission was deleted; create a new entry', 409)
          const previous = store
            .results(home)
            .find((r) => r.idempotencyKey === parsed.idempotencyKey)
          if (replay(home, user.id, previous, values)) return previous!
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
            profitCents: values.profitCents ?? null,
            feesIncluded: values.feesIncluded ?? false,
            lossCents: values.lossCents ?? null,
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
    deleteResult(user: PublicUser, home: string, id: string, body: unknown) {
      return store.atomic(() => {
        const parsed = editTradingSchema(
          z.object({ confirmation: z.literal('DELETE') }).strict(),
        ).parse(body)
        permissions.context(user, home)
        const old = store.results(home).find((r) => r.id === id)
        if (!old) throw new FinancialError('Daily result not found', 404)
        const parent = account(user, home, old.accountId)
        permissions.manage(user, home, parent.responsibleMemberId, true)
        checkRevision(old.revision, parsed.revision)
        store.audit(home, user.id, 'result_deleted', id, old, { reason: parsed.reason })
        store.audit(home, user.id, 'result_submission_retired', old.idempotencyKey, null, { id })
        store.removeResult(home, id)
        return { id }
      })
    },
    saveResults(user: PublicUser, home: string, body: unknown): TradingResult[] {
      const parsed = createTradingSchema(tradingResultBatchSchema).parse(body)
      return saveTradingBatch(
        store,
        user,
        home,
        parsed,
        'results_batch_created',
        (values) =>
          permissions.manage(
            user,
            home,
            account(user, home, values.accountId).responsibleMemberId,
            true,
          ),
        (entry) => {
          const row = this.saveResult(user, home, entry)
          return this.results(user, home).find((r) => r.id === row.id)!
        },
        (id) => {
          const row = this.results(user, home).find((r) => r.id === id)
          if (!row) throw new FinancialError('Daily result not found', 404)
          return row
        },
      )
    },
    history(user: PublicUser, home: string, id: string) {
      permissions.context(user, home)
      return store.history(home, id)
    },
  }
}
export type TradingService = ReturnType<typeof tradingService>
