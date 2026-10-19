export const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
export const optionalText = (data: FormData, key: string) => text(data, key) || null
export const moneyText = (value: number | null | undefined) =>
  value == null
    ? ''
    : `${value < 0 ? '-' : ''}${Math.trunc(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, '0')}`
export function readMoney(data: FormData, key: string, required = false) {
  const value = text(data, key)
  if (!value) {
    if (required) throw new Error('Enter ' + key)
    return null
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error('Use a monetary amount with at most two decimals')
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = value.replace('-', '').split('.')
  const result = (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (negative ? -1 : 1)
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds the supported range')
  return result
}
