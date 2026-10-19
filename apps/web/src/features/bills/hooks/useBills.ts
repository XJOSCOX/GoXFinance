import { useCallback, useEffect, useState } from 'react'
import type { BillChangeRequest, BillView, Debt, HouseholdMember } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { listMembers } from '../../households/api/householdClient'
import { listDebts } from '../../debts/api/debtClient'
import { listBillRequests, listBills, refreshBills } from '../api/billClient'

export function useBills(householdId: string) {
  const [data, setData] = useState<{
    bills: BillView[]
    debts: Debt[]
    members: HouseholdMember[]
    requests: BillChangeRequest[]
  }>({ bills: [], debts: [], members: [], requests: [] })
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const fetchData = useCallback(async () => {
    await refreshBills(householdId)
    const [records, debtRecords, people, proposals] = await Promise.all([
      listBills(householdId),
      listDebts(householdId),
      listMembers(householdId),
      listBillRequests(householdId),
    ])
    return {
      bills: records.bills,
      debts: debtRecords.debts,
      members: people.members,
      requests: proposals.requests,
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
    setData({ bills: [], debts: [], members: [], requests: [] })
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
  return { ...data, error, setError, loading, refresh }
}
