import { WorkspaceLayout } from '../../../components/layout/WorkspaceLayout'
import { useAuth } from '../../auth/hooks/useAuth'
import { useEffect, useState } from 'react'
import { localBillDate, type HouseholdOverview } from '@goxfinance/shared'
import { useHousehold } from '../../households/hooks/useHousehold'
import { Button, Card, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { getOverview } from '../api/overviewClient'
import { OverviewContent } from '../components/OverviewContent'
import { refreshBills } from '../../bills/api/billClient'
import { errorMessage } from '../../../lib/api'

export function DashboardPage() {
  const { user } = useAuth()
  const { selected } = useHousehold()
  const [month, setMonth] = useState(localBillDate().slice(0, 7)),
    [data, setData] = useState<HouseholdOverview | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    if (selected)
      void refreshBills(selected.id)
        .then(() => getOverview(selected.id, month))
        .then((result) => {
          if (active) setData(result)
        })
        .catch((failure) => {
          if (active) setError(errorMessage(failure))
        })
    return () => {
      active = false
    }
  }, [selected, month, reload])
  return (
    <WorkspaceLayout title="Overview">
      <div className="section-heading mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user?.fullName}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {selected?.name} · Your household at a glance.
          </p>
        </div>
        <FormField label="Reporting month">
          <Input
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value)
            }}
          />
        </FormField>
      </div>
      {error ? (
        <Card className="p-5">
          <p role="alert" className="text-rose-300">
            {error}
          </p>
          <Button className="mt-4" onClick={() => setReload((value) => value + 1)}>
            Retry
          </Button>
        </Card>
      ) : data && selected ? (
        <OverviewContent data={data} home={selected.id} />
      ) : (
        <p role="status">Loading overview…</p>
      )}
    </WorkspaceLayout>
  )
}
