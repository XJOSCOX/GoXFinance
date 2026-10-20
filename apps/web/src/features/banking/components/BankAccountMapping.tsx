import { useEffect, useState } from 'react'
import type { AssetData, Debt } from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../../lib/api'
import { FormField, Select } from '../../../components/ui/FormField'
export function BankAccountMapping({
  home,
  credit,
  assetId,
  debtId,
}: {
  home: string
  credit: boolean
  assetId?: string | null
  debtId?: string | null
}) {
  const [assets, setAssets] = useState<AssetData['assets']>([]),
    [debts, setDebts] = useState<Debt[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void Promise.all([
      apiRequest<AssetData>(`households/${home}/assets`),
      apiRequest<{ debts: Debt[] }>(`households/${home}/debts`),
    ])
      .then(([a, d]) => {
        if (active) {
          setAssets(a.assets)
          setDebts(d.debts)
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home])
  const rows = credit
      ? debts
          .filter((d) => d.accountType === 'credit_card')
          .map((d) => ({ id: d.id, name: d.creditorName }))
      : assets
          .filter((a) => ['cash', 'checking', 'savings'].includes(a.category))
          .map((a) => ({ id: a.id, name: a.name })),
    current = credit ? debtId : assetId
  return (
    <div>
      <FormField
        label={
          credit ? 'Existing credit-card debt (optional)' : 'Existing cash / bank asset (optional)'
        }
      >
        <Select
          key={credit ? 'debt' : 'asset'}
          name={credit ? 'debtId' : 'assetId'}
          defaultValue={current ?? ''}
        >
          <option value="">No mapping</option>
          {current && !rows.some((r) => r.id === current) && (
            <option value={current}>Existing mapping</option>
          )}
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </FormField>
      <p className="mt-2 text-xs text-slate-400">
        USD ledger mapping only. The existing asset or debt is counted once; observed bank balances
        do not update it automatically.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          Mappings could not load: {error}
        </p>
      )}
    </div>
  )
}
