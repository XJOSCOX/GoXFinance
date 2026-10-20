import type { NetWorthReport } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function NetWorthSummary({ report }: { report: NetWorthReport }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Known assets', report.assetCents],
          ['Known liabilities', report.liabilityCents],
          ['Known net-worth subtotal', report.subtotalCents],
        ].map(([label, amount]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <strong className="mt-2 block text-xl">{formatMoney(amount as number)}</strong>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        As of {report.asOf}.{' '}
        {report.incomplete
          ? 'Incomplete — this subtotal is not complete net worth.'
          : 'All included assets and liabilities have known recorded values; valuations may still be estimates.'}{' '}
        Joint records and verified duplicates count once.
      </p>
      {report.warnings.length > 0 && (
        <Card className="space-y-1 p-3 text-xs text-amber-200">
          {report.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Asset distribution', report.assetDistribution],
          ['Liability distribution', report.liabilityDistribution],
        ].map(([title, items]) => (
          <Card key={title as string} className="p-4">
            <h2 className="mb-2 text-sm font-semibold">{title as string}</h2>
            {(items as NetWorthReport['assetDistribution']).map((i) => (
              <p key={i.category} className="flex justify-between gap-2 py-1 text-xs">
                <span>{i.category}</span>
                <strong>{formatMoney(i.valueCents)}</strong>
              </p>
            ))}
          </Card>
        ))}
      </div>
    </div>
  )
}
