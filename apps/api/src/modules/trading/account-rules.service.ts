import {
  createTradingSchema,
  tradingAccountRulesBatchSchema,
  tradingAccountSchema,
  tradingRuleSchema,
  editTradingSchema,
  type PublicUser,
  type TradingAccount,
} from '@goxfinance/shared'
import { saveTradingBatch } from './trading-batch'
import type { TradingRepository } from './trading.repository'
import type { TradingPermissions } from './trading.permissions'
import type { TradingService } from './trading.service'
import { FinancialError } from '../households/financial-access'

type Dependencies = { store: TradingRepository; permissions: TradingPermissions } & Pick<
  TradingService,
  'account' | 'accountView' | 'saveAccount'
>
export function updateAccountRules(
  { store, permissions, account, accountView, saveAccount }: Dependencies,
  user: PublicUser,
  home: string,
  body: unknown,
): TradingAccount[] {
  const parsed = createTradingSchema(tradingAccountRulesBatchSchema).parse(body)
  return saveTradingBatch(
    store,
    user,
    home,
    parsed,
    'account_rules_batch_created',
    (entry) =>
      permissions.manage(
        user,
        home,
        account(user, home, entry.accountId).responsibleMemberId,
        true,
      ),
    ({ values: entry }) => {
      const old = account(user, home, entry.accountId)
      const values = tradingAccountSchema.parse({
        ...Object.fromEntries(
          Object.keys(tradingAccountSchema.shape).map((key) => [key, old[key as keyof typeof old]]),
        ),
        tierCents: entry.tierCents,
        maximumLossCents: entry.maximumLossCents,
        dailyLossCents: entry.dailyLossCents,
        ruleSnapshot: entry.ruleSnapshot,
      })
      return saveAccount(
        user,
        home,
        { revision: entry.revision, reason: entry.reason, values },
        entry.accountId,
      )
    },
    (id) => accountView(user, home, account(user, home, id)),
  )
}

export function correctAccountRule(
  { store, permissions, account, saveAccount }: Dependencies,
  user: PublicUser,
  home: string,
  id: string,
  ruleId: string,
  body: unknown,
): TradingAccount {
  return store.atomic(() => {
    const old = account(user, home, id)
    permissions.manage(user, home, old.responsibleMemberId, true)
    const parsed = editTradingSchema(tradingRuleSchema).parse(body)
    const previous = store.rules(home, id).find((r) => r.id === ruleId)
    if (!previous) throw new FinancialError('Rule not found for this account', 404)
    const values = tradingAccountSchema.parse({
      ...Object.fromEntries(
        Object.keys(tradingAccountSchema.shape).map((key) => [key, old[key as keyof typeof old]]),
      ),
      ruleSnapshot: { ...parsed.values, supersedesRuleId: ruleId },
    })
    const record = saveAccount(
      user,
      home,
      { revision: parsed.revision, reason: parsed.reason, values },
      id,
    )
    return record
  })
}
