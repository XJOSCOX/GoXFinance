import { useCallback, useEffect, useState } from 'react'
import { listTrading } from '../api/tradingClient'
import { listMembers } from '../../households/api/householdClient'
import { apiRequest, errorMessage } from '../../../lib/api'
import type { TradingData, HouseholdMember, IncomeData } from '@goxfinance/shared'
export function useTrading(home: string) {
  const [data, setData] = useState<TradingData | null>(null),
    [members, setMembers] = useState<HouseholdMember[]>([]),
    [income, setIncome] = useState<IncomeData | null>(null),
    [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const [trading, people, deposits] = await Promise.all([
      listTrading(home),
      listMembers(home),
      apiRequest<IncomeData>(`households/${home}/income`),
    ])
    setData(trading)
    setMembers(people.members)
    setIncome(deposits)
    setError('')
  }, [home])
  useEffect(() => {
    let active = true
    setData(null)
    Promise.all([
      listTrading(home),
      listMembers(home),
      apiRequest<IncomeData>(`households/${home}/income`),
    ])
      .then(([trading, people, deposits]) => {
        if (active) {
          setData(trading)
          setMembers(people.members)
          setIncome(deposits)
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home])
  return { data, members, income, error, refresh }
}
