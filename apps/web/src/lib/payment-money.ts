export const moneyText = (cents: number | null | undefined) =>
  cents == null ? '' : `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
export function parseMoney(value: string, required = false): number | null {
  const clean = value.trim()
  if (!clean) {
    if (required) throw new Error('Enter an amount')
    return null
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean))
    throw new Error('Enter a nonnegative amount with at most two decimal places')
  const [dollars, cents = ''] = clean.split('.')
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('Amount is too large')
  return result
}
