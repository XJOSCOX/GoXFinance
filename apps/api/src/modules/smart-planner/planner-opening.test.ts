import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { validateOpeningCash } from '../forecasts/forecast-settings'
import { smartInput, smartSources } from '../../../../../packages/shared/src/smart-forecast.fixture'
it('rejects incompatible timestamps, duplicate account identity, duplicate IDs and credit limits when aggregating cash', () => {
  const s = smartSources(),
    v = smartInput(20000),
    a = {
      id: randomUUID(),
      name: 'Fictional checking',
      institution: 'Fictional bank',
      mask: '1234',
      currency: 'USD',
      type: 'checking',
      status: 'active',
      assetId: null,
      balance: {
        source: 'manual',
        id: randomUUID(),
        observedAt: '2026-10-20T12:00:00Z',
        availableCents: 10000,
      },
    }
  const b = {
    ...a,
    id: randomUUID(),
    mask: '5678',
    balance: { ...a.balance, id: randomUUID(), observedAt: '2026-10-20T13:00:00Z' },
  }
  s.cashAccounts = [a, b] as never
  const opening = {
    ...v.smart!.opening!,
    source: 'selected_accounts' as const,
    accounts: [a, b].map((x) => ({
      accountId: x.id,
      balanceId: x.balance.id,
      availableCents: 10000,
    })),
  }
  expect(() => validateOpeningCash(opening, s, '2026-10-20T23:00:00Z')).toThrow('incompatible')
  b.balance.observedAt = a.balance.observedAt
  expect(() => validateOpeningCash(opening, s, '2026-10-20T23:00:00Z')).not.toThrow()
  b.mask = a.mask
  expect(() => validateOpeningCash(opening, s, '2026-10-20T23:00:00Z')).toThrow('same institution')
  b.type = 'credit_card'
  expect(() => validateOpeningCash(opening, s, '2026-10-20T23:00:00Z')).toThrow('unavailable')
})
