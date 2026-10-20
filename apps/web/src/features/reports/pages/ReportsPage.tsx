import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  localBillDate,
  type ReportFilters as Filters,
  type ReportOptions,
  type FinancialReport,
} from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button } from '../../../components/ui'
import { apiRequest, errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import { downloadReport } from '../api/reports'
import { ReportFilters } from '../components/ReportFilters'
import { ReportPreview } from '../components/ReportPreview'
export function ReportsPage() {
  const { householdId: home = '' } = useParams()
  return <ReportsWorkspace key={home} home={home} />
}
function ReportsWorkspace({ home }: { home: string }) {
  const today = localBillDate(),
    notify = useNotify()
  const [filters, setFilters] = useState<Filters>({
    kind: 'income_spending',
    from: today.slice(0, 7) + '-01',
    to: today,
    memberId: null,
    categoryId: null,
    debtId: null,
    accountId: null,
    groupId: null,
  })
  const [options, setOptions] = useState<ReportOptions | null>(null),
    [report, setReport] = useState<FinancialReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setOptions(null)
    setReport(null)
    setError('')
    void apiRequest<ReportOptions>(`households/${home}/reports/options`)
      .then((d) => {
        if (active) {
          setOptions(d)
          setFilters((f) => ({
            ...f,
            memberId: null,
            categoryId: null,
            debtId: null,
            accountId: null,
            groupId: null,
          }))
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home])
  async function preview() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setReport(
        await apiRequest<FinancialReport>(`households/${home}/reports/preview`, {
          method: 'POST',
          body: JSON.stringify(filters),
        }),
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  async function download(format: 'pdf' | 'xlsx' | 'csv' | 'json') {
    if (!report || busy) return
    setBusy(true)
    setError('')
    try {
      await downloadReport(home, report.filters, format)
      notify('success', `${format.toUpperCase()} download started`)
    } catch (e) {
      setError(errorMessage(e))
      notify('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <WorkspaceLayout title="Reports">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Financial reports</h1>
        <p className="mt-1 text-sm text-slate-400">
          Review recorded activity, estimates and progress. Choose a report before downloading.
        </p>
      </header>
      {error && (
        <p role="alert" className="mb-4 text-sm text-rose-300">
          {error}
        </p>
      )}
      {!options && !error ? (
        <p role="status">Loading report options…</p>
      ) : (
        options && (
          <ReportFilters
            value={filters}
            change={(v) => {
              setFilters(v)
              setReport(null)
            }}
            options={options}
            busy={busy}
            onPreview={() => void preview()}
          />
        )
      )}
      <p className="my-4 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-xs text-amber-200/80">
        Downloads contain sensitive financial information. Ordinary PDF, Excel, CSV and JSON files
        are not protected by your database encryption. Keep them in a secure location.
      </p>
      {report && (
        <>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Export formats">
            {(['pdf', 'xlsx', 'csv', 'json'] as const).map((format) => (
              <Button
                key={format}
                variant="secondary"
                disabled={busy}
                onClick={() => void download(format)}
              >
                Export {format.toUpperCase()}
              </Button>
            ))}
          </div>
          <ReportPreview report={report} />
        </>
      )}
    </WorkspaceLayout>
  )
}
