import { useEffect, useState, useCallback } from 'react'
import type { InsightsData } from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../lib/api'
export function useInsights(home: string) {
  const [loaded, setLoaded] = useState<{ home: string; data: InsightsData } | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    let active = true
    void apiRequest<InsightsData>(`households/${home}/insights`)
      .then((data) => {
        if (active) {
          setLoaded({ home, data })
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [home, revision, refresh])
  return { data: loaded?.home === home ? loaded.data : null, error, refresh }
}
