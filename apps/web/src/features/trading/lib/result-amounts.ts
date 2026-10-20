import { readMoney } from '../../../lib/financial-entry'
export type ResultAmounts = { profit: string; loss: string; fees: string; feesIncluded?: boolean }
export const emptyAmounts: ResultAmounts = { profit: '', loss: '', fees: '' }
export function resultAmounts(values: ResultAmounts) {
  const data = new FormData()
  Object.entries(values).forEach(([key, value]) => data.set(key, String(value)))
  const profitCents = readMoney(data, 'profit', true)!,
    lossCents = readMoney(data, 'loss', true)!,
    feesCents = values.feesIncluded ? 0 : (readMoney(data, 'fees') ?? 0)
  if ([profitCents, lossCents, feesCents].some((v) => v < 0))
    throw new Error('Profit, loss and fees must be zero or positive')
  return {
    profitCents,
    lossCents,
    feesCents,
    feesIncluded: values.feesIncluded ?? false,
    grossCents: profitCents - lossCents,
  }
}
