import { apiRequest } from '../../../lib/api'
import type { TradingData } from '@goxfinance/shared'
export const listTrading = (home: string) => apiRequest<TradingData>(`households/${home}/trading`)
export const removeTradingAccount = (
  home: string,
  account: { id: string; revision: number; deletedAt: string | null },
  permanent: boolean,
) =>
  apiRequest(
    `households/${home}/trading/accounts/${account.id}${account.deletedAt && !permanent ? '/restore' : ''}`,
    {
      method: account.deletedAt && !permanent ? 'POST' : 'DELETE',
      body: JSON.stringify({ revision: account.revision, permanent }),
    },
  )
export const saveTrading = (home: string, kind: string, body: unknown, id?: string) =>
  apiRequest(`households/${home}/trading/${kind}${id ? '/' + id : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
