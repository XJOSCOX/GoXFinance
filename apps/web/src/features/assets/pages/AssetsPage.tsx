import { AssetRegister } from '../components/AssetRegister'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { netWorth, localBillDate, type AssetData, type Asset } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { FinancialAudit } from '../../../components/financial/FinancialAudit'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import { formatMoney } from '../../../lib/money'
import { AssetForm } from '../components/AssetForm'
import { ValuationForm } from '../components/ValuationForm'
import { NetWorthSummary } from '../components/NetWorthSummary'
export function AssetsPage() {
  const { householdId: home = '' } = useParams(),
    [data, setData] = useState<AssetData | null>(null),
    [reload, setReload] = useState(0),
    [error, setError] = useState(''),
    [asOf, setAsOf] = useState(localBillDate()),
    [member, setMember] = useState(''),
    [editor, setEditor] = useState<Asset | null | undefined>(),
    [valuation, setValuation] = useState<Asset>(),
    [audit, setAudit] = useState(''),
    [snapshot, setSnapshot] = useState(''),
    [busy, setBusy] = useState(false),
    key = useRef(crypto.randomUUID()),
    notify = useNotify()
  useEffect(() => {
    let active = true
    setData(null)
    void apiRequest<AssetData>(`households/${home}/assets`)
      .then((d) => {
        if (active) {
          setData(d)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home, reload])
  async function save(path: string, body: unknown, edit = false) {
    await apiRequest(`households/${home}/assets${path}`, {
      method: edit ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    })
    setReload(reload + 1)
    notify('success', 'Asset records saved')
  }
  let report: ReturnType<typeof netWorth> | undefined,
    calculationError = ''
  try {
    if (data)
      report = snapshot
        ? data.snapshots.find((s) => s.id === snapshot)?.report
        : netWorth(data, asOf, member || null, localBillDate())
  } catch (e) {
    calculationError = errorMessage(e)
  }
  return (
    <WorkspaceLayout title="Assets & net worth">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assets & net worth</h1>
          <p className="mt-1 text-sm text-slate-400">
            Dated valuations and authoritative debt balances. No automatic cash or trading-balance
            imports.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <FormField label="Valuation as-of date">
            <Input
              type="date"
              max={localBillDate()}
              value={asOf}
              onChange={(e) => {
                if (e.target.value) {
                  setAsOf(e.target.value)
                  setSnapshot('')
                }
              }}
            />
          </FormField>
          <FormField label="Ownership scope">
            <Select
              value={member}
              onChange={(e) => {
                setMember(e.target.value)
                setSnapshot('')
              }}
            >
              <option value="">Whole household</option>
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </header>
      {(error || calculationError) && (
        <p role="alert" className="text-sm text-rose-300">
          {error || calculationError}
          <Button onClick={() => setReload(reload + 1)}>Refresh</Button>
        </p>
      )}
      {!data && !error && <p role="status">Loading assets…</p>}
      {data && report && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {data.canCreate && (
              <Button variant="primary" onClick={() => setEditor(null)}>
                Add asset
              </Button>
            )}
            <Button onClick={() => setReload(reload + 1)}>Refresh</Button>
            <Button onClick={() => setSnapshot('')}>Current records</Button>
            {(member ? data.canCaptureMemberIds.includes(member) : data.canCaptureHousehold) &&
              !snapshot &&
              asOf === localBillDate() && (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (busy) return
                    setBusy(true)
                    try {
                      await save('/snapshots', {
                        idempotencyKey: key.current,
                        fingerprint: data.fingerprint,
                        memberId: member || null,
                      })
                      key.current = crypto.randomUUID()
                    } catch (e) {
                      setError(errorMessage(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Capture dated net-worth snapshot
                </Button>
              )}
          </div>
          {snapshot && (
            <p className="text-xs text-slate-400">
              Immutable captured position ·{' '}
              {data.snapshots.find((s) => s.id === snapshot)?.createdAt}. Select Current records to
              manage assets.
            </p>
          )}
          <NetWorthSummary report={report} />
          <AssetRegister
            data={data}
            report={report}
            edit={setEditor}
            value={setValuation}
            audit={setAudit}
            readOnly={!!snapshot}
          />
          <details className="rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer text-sm">
              Liabilities · existing Debt ledger ({report.liabilities.length})
            </summary>
            {report.liabilities.map((d) => (
              <p key={d.id} className="mt-2 flex justify-between gap-2 text-xs">
                <span>
                  {d.name} · {d.balanceDate ?? 'Date unknown'}
                </span>
                <strong>{formatMoney(d.balanceCents)}</strong>
              </p>
            ))}
          </details>
          <section>
            <h2 className="mb-2 font-semibold">Net-worth snapshot history</h2>
            <div className="flex flex-wrap gap-2">
              {data.snapshots.map((s) => (
                <Button key={s.id} onClick={() => setSnapshot(s.id)}>
                  {s.report.asOf} · {formatMoney(s.report.subtotalCents)} ·{' '}
                  {s.report.memberId ? 'Member' : 'Household'}
                </Button>
              ))}
            </div>
            {!data.snapshots.length && (
              <p className="text-xs text-slate-400">
                No captured snapshots. Capturing preserves the current position without rewriting
                future history.
              </p>
            )}
          </section>
          {data.assets.some((a) => a.status === 'archived') && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-400">Archived assets</summary>
              {data.assets
                .filter((a) => a.status === 'archived')
                .map((a) => (
                  <div key={a.id} className="mt-2 flex justify-between">
                    <span>{a.name}</span>
                    {a.canManage && (
                      <Button size="small" onClick={() => setEditor(a)}>
                        Restore / edit
                      </Button>
                    )}
                  </div>
                ))}
            </details>
          )}
          {editor !== undefined && (
            <AssetForm
              data={data}
              record={editor ?? undefined}
              close={() => setEditor(undefined)}
              save={(body) => save(editor ? '/' + editor.id : '', body, !!editor)}
            />
          )}
          {valuation && (
            <ValuationForm
              asset={valuation}
              data={data}
              close={() => setValuation(undefined)}
              save={(body) => save('/' + valuation.id + '/valuations', body)}
            />
          )}
          {audit && (
            <FinancialAudit
              path={`households/${home}/assets/${audit}/audit`}
              close={() => setAudit('')}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
