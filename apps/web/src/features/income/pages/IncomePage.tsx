import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { localBillDate, type IncomeSource, type IncomeTransaction } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { useIncome } from '../hooks/useIncome'
import { useIncomeToday } from '../hooks/useIncomeToday'
import { saveSource, saveIncome, archiveSource } from '../api/incomeClient'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { IncomeFilters } from '../components/IncomeFilters'
import { useIncomePayroll } from '../hooks/useIncomePayroll'
import { IncomeOverview } from '../components/IncomeOverview'
import { IncomeSources } from '../components/IncomeSources'
import { LatestPaycheck } from '../components/LatestPaycheck'
import { IncomeHistory } from '../components/IncomeHistory'
import { filterIncomeHistory, incomeHistoryDate } from '../components/income-history'
import { IncomeDetails } from '../components/IncomeDetails'
import { IncomeSourceForm } from '../components/IncomeSourceForm'
import { IncomeTransactionForm } from '../components/IncomeTransactionForm'
import { PayrollPanel } from '../payroll/PayrollPanel'
import { PayrollUploadFlow } from '../payroll/PayrollUploadFlow'
export function IncomePage() {
  const { householdId = '' } = useParams(),
    { households, selected, select } = useHousehold(),
    { user } = useAuth(),
    notify = useNotify()
  const today = useIncomeToday()
  const home = households.find((v) => v.id === householdId),
    data = useIncome(householdId)
  const payroll = useIncomePayroll(householdId, data.transactions)
  const [uploadPaycheck, setUploadPaycheck] = useState<{ sourceId?: string } | null>(null),
    [payrollRefresh, setPayrollRefresh] = useState(0),
    [payrollSource, setPayrollSource] = useState('')
  const [tab, setTab] = useState('overview'),
    [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [historyMonth, setHistoryMonth] = useState(''),
    [member, setMember] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('')
  const [source, setSource] = useState<IncomeSource | null | undefined>(),
    [paycheck, setPaycheck] = useState<{
      existing?: IncomeTransaction
      sourceId?: string
      date?: string
    } | null>(null),
    [viewPaycheck, setViewPaycheck] = useState<IncomeTransaction | null>(null),
    [details, setDetails] = useState<IncomeSource | null>(null),
    [archive, setArchive] = useState<IncomeSource | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('')
  useEffect(() => {
    if (home && selected?.id !== householdId) select(householdId)
  }, [home, selected?.id, householdId, select])
  async function persist(work: () => Promise<unknown>, message: string) {
    try {
      await work()
      notify('success', message)
      data.refresh()
    } catch (e) {
      notify('error', errorMessage(e))
      throw e
    }
  }
  const filteredSources = data.sources.filter(
    (v) =>
      (!member || v.responsibleMemberId === member) &&
      v.name.toLowerCase().includes(query.toLowerCase()),
  )
  const transactions = filterIncomeHistory(data.transactions, data.sources, {
    month: historyMonth,
    member,
    status,
    query,
  })
  const historyMonths = [...new Set(data.transactions.map((t) => incomeHistoryDate(t).slice(0, 7)))]
    .sort()
    .reverse()
  const permittedMembers = data.members.filter(
    (v) =>
      (v.status === 'active' || v.id === source?.responsibleMemberId) &&
      (home?.role === 'owner' || v.linkedUserId === user?.id),
  )
  const editableSources = data.sources.filter(
    (v) =>
      v.canManage &&
      ((!v.isArchived && v.status === 'active') || v.id === paycheck?.existing?.sourceId),
  )
  return (
    <WorkspaceLayout title="Income">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Income</h1>
          <p className="mt-2 text-sm text-slate-400">
            Actual deposits and pay history, separate from estimates.
          </p>
        </div>
        {data.canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={data.loading} onClick={() => setUploadPaycheck({})}>
              Upload Paycheck
            </Button>
            <ActionMenu
              label="Income actions"
              items={[
                {
                  label: 'Add employer / source',
                  onSelect: () => setSource(null),
                  disabled: data.loading,
                },
                {
                  label: 'Record income manually',
                  onSelect: () => setPaycheck({}),
                  disabled: data.loading || !editableSources.length,
                },
              ]}
            />
          </div>
        )}
      </header>
      {data.error ? (
        <Card className="p-5">
          <p role="alert" className="text-rose-300">
            {data.error}
          </p>
          <Button className="mt-3" onClick={data.refresh}>
            Retry
          </Button>
        </Card>
      ) : data.loading ? (
        <p role="status">Loading income…</p>
      ) : (
        <>
          <div
            className="mb-5 flex gap-5 overflow-x-auto border-b border-white/10"
            role="tablist"
            aria-label="Income views"
          >
            {[
              ['overview', 'Overview'],
              ['sources', 'Sources'],
              ['history', 'Paychecks'],
              ['payroll', 'Payroll'],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`shrink-0 border-b-2 px-1 pb-3 pt-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b8a9] ${tab === id ? 'border-[#b1beb0] font-medium text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'payroll' && (
            <IncomeFilters
              tab={tab}
              month={month}
              setMonth={setMonth}
              historyMonth={historyMonth}
              setHistoryMonth={setHistoryMonth}
              historyMonths={historyMonths}
              member={member}
              setMember={setMember}
              query={query}
              setQuery={setQuery}
              status={status}
              setStatus={setStatus}
              members={data.members}
            />
          )}
          {tab === 'payroll' ? (
            <PayrollPanel
              key={payrollRefresh}
              preferredSourceId={payrollSource}
              home={householdId}
              sources={data.sources}
              transactions={data.transactions}
              changed={data.refresh}
            />
          ) : tab === 'overview' ? (
            <IncomeOverview
              data={{
                ...data,
                transactions: data.transactions.filter(
                  (v) =>
                    (!member || v.responsibleMemberId === member) &&
                    filteredSources.some((s) => s.id === v.sourceId),
                ),
              }}
              members={data.members}
              weeks={payroll.weeks}
              payrollLoading={payroll.loading}
              payrollError={payroll.error}
              viewPaycheck={setViewPaycheck}
              month={month}
              changeMonth={setMonth}
              today={today}
            />
          ) : tab === 'sources' ? (
            <IncomeSources
              today={today}
              sources={filteredSources}
              transactions={data.transactions}
              members={data.members}
              upload={(s) => setUploadPaycheck({ sourceId: s.id })}
              edit={setSource}
              record={(s, date, existing) => setPaycheck({ sourceId: s.id, date, existing })}
              details={setDetails}
              archive={(v) => {
                setArchive(v)
                setActionError('')
              }}
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                <p role="status">
                  Showing {transactions.length} of {data.transactions.length} paychecks
                  {transactions.length < data.transactions.length
                    ? ` - ${data.transactions.length - transactions.length} hidden by filters`
                    : ''}
                </p>
                {(historyMonth || member || query || status) && (
                  <Button
                    size="small"
                    onClick={() => {
                      setHistoryMonth('')
                      setMember('')
                      setQuery('')
                      setStatus('')
                    }}
                  >
                    Clear history filters
                  </Button>
                )}
              </div>
              <IncomeHistory
                transactions={transactions}
                sources={data.sources}
                view={setViewPaycheck}
                edit={(v) => setPaycheck({ existing: v })}
                details={setDetails}
              />
            </>
          )}
        </>
      )}
      {source !== undefined && (
        <IncomeSourceForm
          source={source ?? undefined}
          members={permittedMembers}
          close={() => setSource(undefined)}
          save={(values, key, reason) =>
            persist(
              () => saveSource(householdId, values, key, source ?? undefined, reason),
              'Income source saved',
            )
          }
        />
      )}
      {uploadPaycheck && (
        <PayrollUploadFlow
          home={householdId}
          preferredSourceId={uploadPaycheck.sourceId}
          close={() => setUploadPaycheck(null)}
          saved={(sourceId) => {
            setUploadPaycheck(null)
            data.refresh()
            setPayrollRefresh((v) => v + 1)
            setPayrollSource(sourceId)
            setTab('payroll')
          }}
        />
      )}
      {paycheck && (
        <IncomeTransactionForm
          sources={editableSources}
          existing={paycheck.existing}
          sourceId={paycheck.sourceId}
          date={paycheck.date}
          close={() => setPaycheck(null)}
          save={(values, key, reason) =>
            persist(
              () => saveIncome(householdId, values, key, paycheck.existing, reason),
              values.status === 'confirmed' ? 'Deposit confirmed' : 'Income saved',
            )
          }
        />
      )}
      {viewPaycheck && (
        <Modal title="Paycheck details" onClose={() => setViewPaycheck(null)} className="max-w-3xl">
          {payroll.error && (
            <p role="alert" className="mb-3 text-sm text-amber-200">
              Statement details unavailable. {payroll.error}
            </p>
          )}
          <LatestPaycheck
            label="Statement & receipt"
            transaction={viewPaycheck}
            source={data.sources.find((s) => s.id === viewPaycheck.sourceId)}
            week={payroll.weeks.find((w) => w.incomeTransactionId === viewPaycheck.id)}
            member={data.members.find((m) => m.id === viewPaycheck.responsibleMemberId)?.fullName}
          />
        </Modal>
      )}
      {details && (
        <IncomeDetails
          home={householdId}
          source={details}
          transactions={data.transactions}
          close={() => setDetails(null)}
        />
      )}
      {archive && (
        <Modal
          title={archive.isArchived ? 'Restore income source?' : 'Archive income source?'}
          onClose={() => {
            if (!busy) setArchive(null)
          }}
        >
          <p className="text-sm text-slate-400">
            {archive.name}. Existing paychecks and audit history will be preserved.
          </p>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-rose-300">
              {actionError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setArchive(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await persist(() => archiveSource(householdId, archive), 'Income source updated')
                  setArchive(null)
                } catch (e) {
                  setActionError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Saving…' : archive.isArchived ? 'Restore' : 'Archive'}
            </Button>
          </div>
        </Modal>
      )}
    </WorkspaceLayout>
  )
}
