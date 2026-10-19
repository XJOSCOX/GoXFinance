import {
  createTradingSchema,
  tradingAccountBatchSchema,
  type PublicUser,
  type TradingAccount,
} from '@goxfinance/shared'
import { saveTradingBatch } from './trading-batch'
import type { TradingRepository } from './trading.repository'
import type { TradingPermissions } from './trading.permissions'

export function createAccounts(
  store: TradingRepository,
  permissions: TradingPermissions,
  user: PublicUser,
  home: string,
  body: unknown,
  save: (body: unknown) => TradingAccount,
  view: (id: string) => TradingAccount,
) {
  const parsed = createTradingSchema(tradingAccountBatchSchema).parse(body)
  return saveTradingBatch(
    store,
    user,
    home,
    parsed,
    'accounts_batch_created',
    (values) => permissions.manage(user, home, values.responsibleMemberId),
    save,
    view,
  )
}
