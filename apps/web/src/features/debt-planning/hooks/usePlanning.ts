import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanningData } from '@goxfinance/shared'
import { listPlanning } from '../api/planningClient'
import { errorMessage } from '../../../lib/api'
export function usePlanning(home: string) {
  const [data, setData] = useState<PlanningData | null>(null),
    [error, setError] = useState(''),
    version = useRef(0)
  const refresh = useCallback(async () => {
    const n = ++version.current
    try {
      const result = await listPlanning(home)
      if (n === version.current) {
        setData(result)
        setError('')
      }
    } catch (e) {
      if (n === version.current) setError(errorMessage(e))
      throw e
    }
  }, [home])
  const invalidate = useCallback(() => {
    version.current++
  }, [])
  useEffect(() => {
    setData(null)
    void refresh().catch(() => {})
    return invalidate
  }, [refresh, invalidate])
  return { data, error, refresh }
}
