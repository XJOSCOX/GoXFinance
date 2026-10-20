import { text, readMoney } from '../../../lib/financial-entry'
import type { TradingResult } from '@goxfinance/shared'
export function dailyResultDate(data: FormData, reported: boolean, result?: TradingResult) {
  return {
    reportedDate: reported ? text(data, 'reportedDate') : null,
    sessionAt: reported
      ? result?.reportedDate
        ? result.sessionAt
        : new Date().toISOString()
      : new Date(text(data, 'sessionAt')).toISOString(),
  }
}
export function reportedNetAmounts(value: string) {
  const data = new FormData()
  data.set('net', value)
  return {
    grossCents: readMoney(data, 'net', true)!,
    profitCents: null,
    lossCents: null,
    feesCents: 0,
    feesIncluded: true,
  }
}
