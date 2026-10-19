import { createHash } from 'node:crypto'

export const financialFingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function financialFingerprintMatches(
  value: unknown,
  expected: string,
  originalJson: string,
) {
  if (financialFingerprint(value) === expected) return true
  const original = JSON.parse(originalJson) as unknown
  function hasCategory(input: unknown): boolean {
    return (
      input !== null &&
      typeof input === 'object' &&
      (Object.hasOwn(input, 'categoryId') || Object.values(input).some(hasCategory))
    )
  }
  if (hasCategory(original)) return false
  const state = value as {
    debt?: { categoryId?: string | null }
    debts?: { categoryId?: string | null }[]
  }
  // Migration never categorizes debts. A newly assigned debt category is a real change.
  if (state.debt?.categoryId != null || state.debts?.some((debt) => debt.categoryId != null))
    return false
  // Pre-0015 requests did not serialize category associations. Financial values,
  // revisions, timestamps and related audit entries remain part of this comparison.
  const legacy = JSON.stringify(value, (key, entry: unknown) =>
    key === 'categoryId' ? undefined : entry,
  )
  return createHash('sha256').update(legacy).digest('hex') === expected
}
