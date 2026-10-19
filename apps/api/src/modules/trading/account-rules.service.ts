import {
  createTradingSchema,
  tradingAccountRulesBatchSchema,
  tradingAccountSchema,
  type PublicUser,
  type TradingAccount,
} from '@goxfinance/shared'
import { saveTradingBatch } from './trading-batch'
import type { TradingRepository } from './trading.repository'
import type { TradingPermissions } from './trading.permissions'
import type { TradingService } from './trading.service'

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
