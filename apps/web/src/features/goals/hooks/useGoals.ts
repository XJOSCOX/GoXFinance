import { useCallback, useEffect, useState } from 'react'
import type { GoalsData } from '@goxfinance/shared'
import { listGoals } from '../api/goalClient'
import { errorMessage } from '../../../lib/api'
export function useGoals(home: string) {
  const [data, setData] = useState<GoalsData | null>(null),
    [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setData(await listGoals(home))
    setError('')
  }, [home])
  useEffect(() => {
    let active = true
    setData(null)
    listGoals(home)
      .then((v) => {
        if (active) setData(v)
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home])
  return { data, error, refresh }
}
