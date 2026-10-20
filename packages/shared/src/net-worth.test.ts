import { expect, it } from 'vitest'
import { netWorth } from './net-worth'
import type { AssetSources } from './assets'
const sources = (): AssetSources => ({
  assets: [
    {
      id: 'car',
      name: 'Fictional car',
      category: 'vehicle',
      status: 'active',
      memberIds: ['a', 'b'],
      debtIds: ['loan'],
      purchaseCents: 2500000,
    } as never,
  ],
  valuations: [
    {
      id: 'v',
      assetId: 'car',
      valueCents: 1000000,
      valuationDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      supersedesId: null,
      confidence: 'estimated',
    } as never,
  ],
  debts: [
    {
      id: 'loan',
      householdId: 'home',
      creditorName: 'Fictional loan',
      accountType: 'auto_loan',
      currentBalanceCents: 1200000,
      confidence: 'confirmed',
      isArchived: false,
      memberAssignments: [
        { memberId: 'a', responsibility: 'joint' },
        { memberId: 'b', responsibility: 'joint' },
      ],
    } as never,
  ],
  balances: [
    {
      id: 'balance',
      debtId: 'loan',
      balanceCents: 1200000,
      effectiveDate: '2026-10-01',
      createdAt: '2026-10-01T00:00:00Z',
      source: 'creditor_statement',
    } as never,
  ],
})
it('counts joint assets and liabilities once, supports negative equity and separate member association views', () => {
  const s = sources(),
    report = netWorth(s, '2026-10-20', null, '2026-10-20')
  expect(report).toMatchObject({
    assetCents: 1000000,
    liabilityCents: 1200000,
    subtotalCents: -200000,
    incomplete: false,
  })
  expect(report.assets[0].equityCents).toBe(-200000)
  expect(netWorth(s, '2026-10-20', 'a', '2026-10-20').subtotalCents).toBe(-200000)
  expect(netWorth(s, '2026-10-20', 'b', '2026-10-20').subtotalCents).toBe(-200000)
})
it('never infers market value from purchase price and keeps missing balances incomplete', () => {
  const s = sources()
  s.valuations = []
  s.balances = []
  s.debts[0].currentBalanceCents = null
  expect(netWorth(s, '2026-10-20', null, '2026-10-20')).toMatchObject({
    assetCents: 0,
    liabilityCents: 0,
    incomplete: true,
  })
  expect(netWorth(s, '2026-10-20', null, '2026-10-20').assets[0].equityCents).toBeNull()
})
it('uses dated valuations and authoritative balance history and preserves corrections', () => {
  const s = sources()
  s.valuations.push({
    ...s.valuations[0],
    id: 'corrected',
    valueCents: 900000,
    supersedesId: 'v',
    createdAt: '2026-10-20T00:00:00Z',
  })
  expect(netWorth(s, '2026-10-20', null, '2026-10-20').assetCents).toBe(900000)
  expect(s.valuations[0].valueCents).toBe(1000000)
  expect(netWorth(s, '2026-09-30', null, '2026-10-20')).toMatchObject({
    assetCents: 0,
    liabilityCents: 0,
    incomplete: true,
  })
})
it('deduplicates verified collection links, multiple asset links and never imports trading account tiers', () => {
  const s = sources()
  s.debts.push({
    ...s.debts[0],
    id: 'collection',
    accountType: 'collection',
    linkedOriginalDebtId: 'loan',
    duplicateLinkVerified: true,
  })
  s.assets[0].debtIds.push('collection')
  expect(netWorth(s, '2026-10-20', null, '2026-10-20').liabilityCents).toBe(1200000)
  expect(netWorth(s, '2026-10-20', null, '2026-10-20').assets[0].equityCents).toBe(-200000)
  expect(
    netWorth({ ...s, assets: [], valuations: [] }, '2026-10-20', null, '2026-10-20').assetCents,
  ).toBe(0)
})
