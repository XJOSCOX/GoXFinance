import { randomUUID } from 'node:crypto'
import {
  createTradingSchema,
  promoteCombineSchema,
  type PublicUser,
  type TradingAccountInput,
  type TradingAccount,
} from '@goxfinance/shared'
import type { TradingRepository } from './trading.repository'
import type { TradingPermissions } from './trading.permissions'
import { checkRevision } from './trading.permissions'
import { FinancialError } from '../households/financial-access'
export function promoteCombine(
  store: TradingRepository,
  permissions: TradingPermissions,
  user: PublicUser,
  home: string,
  id: string,
  body: unknown,
  createAccount: (body: unknown) => TradingAccount,
) {
  return store.atomic(() => {
    const parsed = createTradingSchema(promoteCombineSchema).parse(body),
      values = parsed.values
    permissions.context(user, home)
    const source = store.accounts(home).find((a) => a.id === id)
    if (!source) throw new FinancialError('Combine account not found', 404)
    permissions.manage(user, home, source.responsibleMemberId, true)
    const existing = store
      .promotions(home)
      .find((p) => p.sourceAccountId === id || p.idempotencyKey === parsed.idempotencyKey)
    if (existing) {
      const audit = store.history(home, id).find((a) => a.action === 'combine_promoted')
      if (
        existing.sourceAccountId !== id ||
        existing.idempotencyKey !== parsed.idempotencyKey ||
        existing.createdByUserId !== user.id ||
        JSON.stringify(JSON.parse(audit?.afterJson ?? '{}').input) !== JSON.stringify(values)
      )
        throw new FinancialError(
          'This Combine has already been promoted or the submission key was used',
          409,
        )
      return existing
    }
    if (
      source.stage !== 'combine' ||
      source.deletedAt ||
      !['active', 'passed'].includes(source.status)
    )
      throw new FinancialError('Select an active or confirmed passed Combine', 409)
    checkRevision(source.revision, values.sourceRevision)
    const targetValues: TradingAccountInput = {
      responsibleMemberId: source.responsibleMemberId,
      provider: 'Topstep',
      nickname: values.nickname,
      maskedExternalId: values.maskedExternalId,
      stage: 'xfa',
      xfaPath: values.xfaPath,
      tierCents: source.tierCents,
      reportedBalanceCents: values.reportedBalanceCents ?? source.tierCents,
      maximumLossCents: values.maximumLossCents,
      dailyLossCents: values.dailyLossCents,
      activationDate: values.activationDate,
      status: 'active',
      timezone: source.timezone,
      sessionStart: source.sessionStart,
      notes: values.notes,
      ruleSnapshot: values.ruleSnapshot,
    }
    const target = createAccount({ idempotencyKey: randomUUID(), values: targetValues })
    const now = new Date().toISOString(),
      link = {
        id: randomUUID(),
        householdId: home,
        createdByUserId: user.id,
        idempotencyKey: parsed.idempotencyKey,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        sourceAccountId: id,
        targetAccountId: target.id,
      }
    store.writeAccount(
      { ...source, status: 'passed', revision: source.revision + 1, updatedAt: now },
      true,
    )
    store.addPromotion(link)
    store.audit(home, user.id, 'combine_promoted', id, source, link, values)
    store.audit(home, user.id, 'xfa_created_from_combine', target.id, null, link)
    return link
  })
}
