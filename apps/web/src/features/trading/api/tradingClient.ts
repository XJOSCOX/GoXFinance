import { apiRequest } from '../../../lib/api'
import type { TradingData } from '@goxfinance/shared'
export const listTrading = (home: string) => apiRequest<TradingData>(`households/${home}/trading`)
export const saveTrading = (home: string, kind: string, body: unknown, id?: string) =>
  apiRequest(`households/${home}/trading/${kind}${id ? '/' + id : ''}`, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
