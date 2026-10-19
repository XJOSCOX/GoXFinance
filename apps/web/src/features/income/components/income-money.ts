import { moneyText, parseMoney } from '../../../lib/payment-money'
export function moneyInputs<T extends string>(
  fields: readonly T[],
  value?: Partial<Record<T, number | null>>,
) {
  return Object.fromEntries(fields.map((key) => [key, moneyText(value?.[key] ?? null)])) as Record<
    T,
    string
  >
}
export function parseMoneyInputs<T extends string>(value: Record<T, string>) {
  return Object.fromEntries(
    Object.entries<string>(value).map(([key, text]) => [key, parseMoney(text)]),
  ) as Record<T, number | null>
}
