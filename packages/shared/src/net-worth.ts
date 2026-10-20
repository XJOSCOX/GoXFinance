import type { AssetSources, NetWorthReport } from './assets'
import { debtObligationGroups, representativeDebtBalance } from './debt-calculations'
import { sumCents } from './outflows'
export function netWorth(
  s: AssetSources,
  asOf: string,
  memberId: string | null,
  today: string,
): NetWorthReport {
  const warnings: string[] = [],
    superseded = new Set(s.valuations.map((v) => v.supersedesId).filter(Boolean))
  const assets = s.assets
    .filter((a) => a.status === 'active' && (!memberId || a.memberIds.includes(memberId)))
    .map((a) => {
      const v = s.valuations
        .filter((v) => v.assetId === a.id && !superseded.has(v.id) && v.valuationDate <= asOf)
        .sort(
          (a, b) =>
            b.valuationDate.localeCompare(a.valuationDate) ||
            b.createdAt.localeCompare(a.createdAt) ||
            b.id.localeCompare(a.id),
        )[0]
      if (v?.valueCents === null || !v) warnings.push(`Missing valuation: ${a.name}`)
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        valueCents: v?.valueCents ?? null,
        valuationDate: v?.valuationDate ?? null,
        confidence: v?.confidence ?? 'unverified',
        equityCents: null as number | null,
      }
    })
  const historical = s.debts.map((d) => {
    const point = s.balances
      .filter((b) => b.debtId === d.id && b.effectiveDate <= asOf)
      .sort(
        (a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      )[0]
    return {
      ...d,
      currentBalanceCents: point?.balanceCents ?? (asOf === today ? d.currentBalanceCents : null),
      confidence: point
        ? ((point.source === 'initial' ? 'unverified' : 'confirmed') as 'confirmed' | 'unverified')
        : d.confidence,
      balanceDate:
        point?.effectiveDate ??
        (asOf === today ? (d.balanceVerifiedAt?.slice(0, 10) ?? null) : null),
    }
  })
  const groups = debtObligationGroups(historical),
    liabilities = groups
      .filter(
        (g) => !memberId || g.some((d) => d.memberAssignments.some((m) => m.memberId === memberId)),
      )
      .map((g) => {
        const d = representativeDebtBalance(g),
          point = historical.find((r) => r.id === d.id)!
        if (d.currentBalanceCents === null) warnings.push(`Missing debt balance: ${d.creditorName}`)
        return {
          id: d.id,
          name: d.accountNickname || d.creditorName,
          balanceCents: d.currentBalanceCents,
          balanceDate: point.balanceDate,
        }
      })
  for (const a of assets) {
    const links = s.assets.find((r) => r.id === a.id)!.debtIds,
      linked = groups
        .filter((g) => g.some((d) => links.includes(d.id)))
        .map(representativeDebtBalance)
    a.equityCents =
      a.valueCents === null || linked.some((d) => d.currentBalanceCents === null)
        ? null
        : sumCents([a.valueCents, ...linked.map((d) => -d.currentBalanceCents!)])
  }
  const assetCents = sumCents(assets.map((a) => a.valueCents ?? 0)),
    liabilityCents = sumCents(liabilities.map((d) => d.balanceCents ?? 0))
  if (asOf !== today)
    warnings.push(
      'Historical values use dated records with current ownership, archive state and duplicate links; use saved snapshots for the original recorded net-worth position.',
    )
  const distributions = (items: { category: string; valueCents: number }[]) => {
    const map = new Map<string, number>()
    for (const i of items) map.set(i.category, sumCents([map.get(i.category) ?? 0, i.valueCents]))
    return [...map].map(([category, valueCents]) => ({ category, valueCents }))
  }
  return {
    asOf,
    memberId,
    assets,
    liabilities,
    assetCents,
    liabilityCents,
    subtotalCents: sumCents([assetCents, -liabilityCents]),
    incomplete: warnings.length > 0,
    warnings,
    assetDistribution: distributions(
      assets
        .filter((a) => a.valueCents !== null)
        .map((a) => ({ category: a.category, valueCents: a.valueCents! })),
    ),
    liabilityDistribution: distributions(
      liabilities
        .filter((d) => d.balanceCents !== null)
        .map((d) => ({
          category: s.debts.find((r) => r.id === d.id)!.accountType,
          valueCents: d.balanceCents!,
        })),
    ),
  }
}
