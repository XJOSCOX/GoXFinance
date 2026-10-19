import { describe, expect, it } from 'vitest'
import { createDebtSchema, type Debt } from '@goxfinance/shared'
import { groupDebts } from './debt-groups'

function debt(id: string, changes: Partial<Debt> = {}): Debt {
  return {
    ...createDebtSchema.parse({
      creditorName: 'Example lender',
      accountType: 'credit_card',
      memberAssignments: [
        { memberId: '00000000-0000-4000-8000-000000000001', responsibility: 'primary' },
      ],
    }),
    id,
    householdId: 'home',
    createdByUserId: 'user',
    isArchived: false,
    createdAt: '',
    updatedAt: '',
    currentBalanceCents: 10000,
    ...changes,
  }
}

describe('debt account sections', () => {
  it('separates collections, charge-offs, current, delinquent, and other accounts', () => {
    const groups = groupDebts([
      debt('collection', { accountType: 'collection', paymentStatus: 'charged_off' }),
      debt('charged', { paymentStatus: 'charged_off', accountStatus: 'closed' }),
      debt('current', { paymentStatus: 'current' }),
      debt('late', { paymentStatus: '120_plus_days_late' }),
      debt('unknown'),
      debt('paid', { paymentStatus: 'paid', currentBalanceCents: 0 }),
    ])
    expect(
      groups.map((group) => [group.id, group.debts.map((item) => item.id), group.balanceCents]),
    ).toEqual([
      ['collections', ['collection'], 10000],
      ['charged-off', ['charged'], 10000],
      ['past-due', ['late'], 10000],
      ['current', ['current'], 10000],
      ['other', ['unknown', 'paid'], 10000],
    ])
  })
  it('counts a verified original/collection pair once in collections, including shared debt', () => {
    const groups = groupDebts([
      debt('original', { paymentStatus: 'charged_off', confidence: 'confirmed' }),
      debt('collection', {
        paymentStatus: 'collection',
        currentBalanceCents: 9000,
        linkedOriginalDebtId: 'original',
        duplicateLinkVerified: true,
      }),
    ])
    expect(groups[0]).toMatchObject({ obligationCount: 1, balanceCents: 10000 })
    expect(groups[0].debts).toHaveLength(2)
    expect(groups.find((group) => group.id === 'charged-off')?.balanceCents).toBe(0)
    expect(groups.reduce((sum, group) => sum + group.balanceCents, 0)).toBe(10000)
  })
  it('keeps unverified links separate', () => {
    const groups = groupDebts([
      debt('original', { paymentStatus: 'charged_off' }),
      debt('collection', { accountType: 'collection', linkedOriginalDebtId: 'original' }),
    ])
    expect(groups.reduce((sum, group) => sum + group.balanceCents, 0)).toBe(20000)
  })
  it('preserves unknown and zero balances separately', () => {
    const current = groupDebts([
      debt('unknown', { paymentStatus: 'current', currentBalanceCents: null }),
      debt('zero', { paymentStatus: 'current', currentBalanceCents: 0 }),
    ]).find((group) => group.id === 'current')!
    expect(current).toMatchObject({ balanceCents: 0, unknownCount: 1, obligationCount: 2 })
  })
  it('summarizes archived selections without altering records', () => {
    const archived = debt('archived', { isArchived: true, paymentStatus: 'collection' })
    expect(groupDebts([archived])[0].balanceCents).toBe(10000)
    expect(archived.isArchived).toBe(true)
  })
  it('preserves incoming sort order and shows empty primary sections', () => {
    const groups = groupDebts([
      debt('second', { paymentStatus: 'current' }),
      debt('first', { paymentStatus: 'current' }),
    ])
    expect(groups.find((group) => group.id === 'current')?.debts.map((item) => item.id)).toEqual([
      'second',
      'first',
    ])
    expect(groupDebts([]).map((group) => group.id)).toEqual([
      'collections',
      'charged-off',
      'current',
    ])
  })
})
