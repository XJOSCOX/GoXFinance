import type { Asset, AssetData, NetWorthReport } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function AssetRegister({
  data,
  report,
  edit,
  value,
  audit,
  readOnly,
}: {
  data: AssetData
  report: NetWorthReport
  edit: (a: Asset) => void
  value: (a: Asset) => void
  audit: (id: string) => void
  readOnly: boolean
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">Assets & equity</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {report.assets.map((row) => {
          const asset = data.assets.find((a) => a.id === row.id)
          return (
            <Card key={row.id} className="p-4">
              <header className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{row.name}</h3>
                  <p className="text-xs text-slate-400">
                    {row.category} · {row.confidence} · {row.valuationDate ?? 'No valuation'}
                  </p>
                </div>
                <strong>{formatMoney(row.valueCents)}</strong>
              </header>
              <p className="mt-2 text-xs text-slate-400">
                Equity after linked liabilities: {formatMoney(row.equityCents)}. Association view;
                do not sum equity across assets sharing a loan.
              </p>
              {asset && !readOnly && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {asset.canManage && (
                      <>
                        <Button size="small" onClick={() => edit(asset)}>
                          Edit asset
                        </Button>
                        <Button size="small" onClick={() => value(asset)}>
                          Add / correct value
                        </Button>
                      </>
                    )}
                    <Button size="small" onClick={() => audit(asset.id)}>
                      Audit
                    </Button>
                  </div>
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-slate-400">Valuation history</summary>
                    {data.valuations
                      .filter((v) => v.assetId === asset.id)
                      .map((v) => (
                        <p key={v.id} className="mt-2">
                          {v.valuationDate} · {formatMoney(v.valueCents)} · {v.source} ·{' '}
                          {v.confidence}
                          {data.valuations.some((r) => r.supersedesId === v.id)
                            ? ' · Corrected (retained)'
                            : ''}{' '}
                          · recorded {new Date(v.createdAt).toLocaleString()}
                        </p>
                      ))}
                  </details>
                </>
              )}
            </Card>
          )
        })}
      </div>
      {!report.assets.length && (
        <Card className="p-6 text-sm text-slate-400">
          No active assets for this scope. Enter values explicitly; unknown amounts stay unknown.
        </Card>
      )}
    </section>
  )
}
