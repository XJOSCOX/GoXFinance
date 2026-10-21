import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { localBillDate, type IncomeSource, type IncomeTransaction } from '@goxfinance/shared'
import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { Button, Card, Input } from '../../../components/ui'
import { Select, FormField } from '../../../components/ui/FormField'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { useHousehold } from '../../households/hooks/useHousehold'
import { useAuth } from '../../auth/hooks/useAuth'
import { useIncome } from '../hooks/useIncome'
import { useIncomeToday } from '../hooks/useIncomeToday'
import { saveSource, saveIncome, archiveSource } from '../api/incomeClient'
import { IncomeOverview } from '../components/IncomeOverview'
import { IncomeSources } from '../components/IncomeSources'
import { IncomeHistory } from '../components/IncomeHistory'
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
  const [uploadPaycheck, setUploadPaycheck] = useState<{ sourceId?: string } | null>(null),
    [payrollRefresh, setPayrollRefresh] = useState(0),
    [payrollSource, setPayrollSource] = useState('')
  const [tab, setTab] = useState('overview'),
    [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [member, setMember] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('')
  const [source, setSource] = useState<IncomeSource | null | undefined>(),
    [paycheck, setPaycheck] = useState<{
      existing?: IncomeTransaction
      sourceId?: string
      date?: string
    } | null>(null),
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
  const transactions = data.transactions.filter(
    (v) =>
      (v.status === 'confirmed' ? (v.depositDate ?? v.payDate) : v.payDate).startsWith(month) &&
      (!member || v.responsibleMemberId === member) &&
      (!status || v.status === status) &&
      (data.sources.find((s) => s.id === v.sourceId)?.name ?? '')
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
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
            <Button disabled={data.loading} onClick={() => setSource(null)}>
              Add employer / source
            </Button>
            <Button
              disabled={data.loading || !editableSources.length}
              onClick={() => setPaycheck({})}
            >
              Record income
            </Button>
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
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Income views">
            {[
              ['overview', 'Overview'],
              ['sources', 'Income sources'],
              ['history', 'Paycheck history'],
              ['payroll', 'Payroll'],
            ].map(([id, label]) => (
              <Button
                key={id}
                role="tab"
                aria-selected={tab === id}
                variant={tab === id ? 'primary' : 'secondary'}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {tab !== 'payroll' && (
            <Card className="mb-5 grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField label="Reporting month">
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value)
                  }}
                />
              </FormField>
              <FormField label="Earning member">
                <Select value={member} onChange={(e) => setMember(e.target.value)}>
                  <option value="">All members</option>
                  {data.members.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.fullName}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Search sources">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Employer or source"
                />
              </FormField>
              {tab === 'history' && (
                <FormField label="Paycheck status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {['expected', 'pending', 'confirmed', 'cancelled'].map((v) => (
                      <option key={v} value={v}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
            </Card>
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
              month={month}
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
            <IncomeHistory
              transactions={transactions}
              sources={data.sources}
              edit={(v) => setPaycheck({ existing: v })}
              details={setDetails}
            />
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
