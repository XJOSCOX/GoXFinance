import { useCallback, useEffect, useState } from 'react'
import type {
  BillChangeRequest,
  BillView,
  Debt,
  HouseholdMember,
  PlannerData,
} from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../../lib/api'
import { listMembers } from '../../households/api/householdClient'
import { listDebts } from '../../debts/api/debtClient'
import { listBillRequests, listBills, refreshBills } from '../api/billClient'

export function useBills(householdId: string) {
  const [data, setData] = useState<{
    bills: BillView[]
    debts: Debt[]
    members: HouseholdMember[]
    requests: BillChangeRequest[]
    planner: PlannerData | null
  }>({ bills: [], debts: [], members: [], requests: [], planner: null })
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const fetchData = useCallback(async () => {
    await refreshBills(householdId)
    const [records, debtRecords, people, proposals, planner] = await Promise.all([
      listBills(householdId),
      listDebts(householdId),
      listMembers(householdId),
      listBillRequests(householdId),
      apiRequest<PlannerData>(`households/${householdId}/planner`),
    ])
    return {
      bills: records.bills,
      debts: debtRecords.debts,
      members: people.members,
      requests: proposals.requests,
      planner,
    }
  }, [householdId])
  const refresh = useCallback(async () => {
    setData(await fetchData())
    setError('')
  }, [fetchData])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData({ bills: [], debts: [], members: [], requests: [], planner: null })
    void fetchData()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchData])
  useEffect(() => {
    let active = true
    const update = () => {
      void fetchData()
        .then((result) => {
          if (active) {
            setData(result)
            setError('')
          }
        })
        .catch((failure) => {
          if (active) setError(errorMessage(failure))
        })
    }
    const visible = () => {
      if (document.visibilityState === 'visible') update()
    }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [fetchData])
  return { ...data, error, setError, loading, refresh }
}
