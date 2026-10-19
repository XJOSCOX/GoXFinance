import { useCallback, useEffect, useState } from 'react'
import type { IncomeData, HouseholdMember } from '@goxfinance/shared'
import { listIncome } from '../api/incomeClient'
import { listMembers } from '../../households/api/householdClient'
import { errorMessage } from '../../../lib/api'
export function useIncome(home: string) {
  const [data, setData] = useState<IncomeData>({ sources: [], transactions: [], canCreate: false }),
    [members, setMembers] = useState<HouseholdMember[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [generation, setGeneration] = useState(0)
  const refresh = useCallback(() => setGeneration((v) => v + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData({ sources: [], transactions: [], canCreate: false })
    setMembers([])
    void Promise.all([listIncome(home), listMembers(home)])
      .then(([result, people]) => {
        if (active) {
          setData(result)
          setMembers(people.members)
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [home, generation])
  return { ...data, members, error, loading, refresh }
}
