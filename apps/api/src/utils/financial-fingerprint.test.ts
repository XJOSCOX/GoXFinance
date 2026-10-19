import { expect, it } from 'vitest'
import { financialFingerprint, financialFingerprintMatches } from './financial-fingerprint'

it('keeps legacy bill requests valid after metadata-only associations are added', () => {
  const old = {
    bill: { id: 'bill', revision: 1, category: 'Other' },
    periods: [{ amountCents: 10000, category: 'Other' }],
    payments: [],
    debts: [],
    linkedPaymentAudit: [],
  }
  const current = {
    ...old,
    bill: { ...old.bill, categoryId: 'category' },
    periods: [{ ...old.periods[0], categoryId: 'category' }],
  }
  expect(financialFingerprintMatches(current, financialFingerprint(old), JSON.stringify(old))).toBe(
    true,
  )
  expect(
    financialFingerprintMatches(
      { ...current, bill: { ...current.bill, revision: 2 } },
      financialFingerprint(old),
      JSON.stringify(old),
    ),
  ).toBe(false)
  expect(
    financialFingerprintMatches(
      { ...current, periods: [{ ...current.periods[0], amountCents: 9000 }] },
      financialFingerprint(old),
      JSON.stringify(old),
    ),
  ).toBe(false)
})
it('rejects new category changes and preserves ordinary payment staleness checks', () => {
  const current = {
    debt: { categoryId: null, updatedAt: '2026-01-01' },
    payment: { amountCents: 10000 },
  }
  expect(
    financialFingerprintMatches(
      { ...current, debt: { ...current.debt, categoryId: 'new' } },
      financialFingerprint(current),
      JSON.stringify(current.debt),
    ),
  ).toBe(false)
  const old = { debt: { updatedAt: '2026-01-01' }, payment: { amountCents: 10000 } }
  expect(
    financialFingerprintMatches(
      { ...current, payment: { amountCents: 9000 } },
      financialFingerprint(old),
      JSON.stringify(old.payment),
    ),
  ).toBe(false)
  expect(
    financialFingerprintMatches(
      { ...current, debt: { ...current.debt, categoryId: 'new' } },
      financialFingerprint(old),
      JSON.stringify(old.payment),
    ),
  ).toBe(false)
})
