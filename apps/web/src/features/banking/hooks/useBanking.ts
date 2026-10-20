import { useEffect, useState } from 'react'
import { apiRequest, errorMessage } from '../../../lib/api'
export function useBanking<T>(home: string, suffix = '') {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    void apiRequest<T>(`households/${home}/banking${suffix}`)
      .then((value) => {
        if (active) {
          setData(value)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [home, suffix, revision])
  return { data, error, refresh: () => setRevision((v) => v + 1) }
}
