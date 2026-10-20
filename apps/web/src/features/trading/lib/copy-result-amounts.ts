import { readMoney, text } from '../../../lib/financial-entry'
import { resultAmounts } from './result-amounts'
export function readCopyAmounts(data: FormData, accountId: string) {
  return text(data, 'split:' + accountId) === 'true'
    ? resultAmounts({
        profit: text(data, 'profit:' + accountId),
        loss: text(data, 'loss:' + accountId),
        fees: text(data, 'fees:' + accountId),
        feesIncluded: text(data, 'feesIncluded:' + accountId) === 'true',
      })
    : {
        grossCents: readMoney(data, 'gross:' + accountId, true),
        feesCents: readMoney(data, 'fees:' + accountId) ?? 0,
        profitCents: null,
        lossCents: null,
        feesIncluded: false,
      }
}
