import { useCallback, useEffect, useRef, useState } from 'react'
import type { BudgetReport } from '@goxfinance/shared'
import { listBudgets } from '../api/budgetClient'
import { errorMessage } from '../../../lib/api'
export function useBudgets(home: string, month: string, member = '') {
  const [data, setData] = useState<BudgetReport | null>(null),
    [error, setError] = useState(''),
    sequence = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++sequence.current
    try {
      const next = await listBudgets(home, month, member)
      if (sequence.current === id) {
        setData(next)
        setError('')
      }
    } catch (e) {
      if (sequence.current === id) setError(errorMessage(e))
      throw e
    }
  }, [home, month, member])
  const invalidate = useCallback(() => {
    sequence.current++
  }, [])
  useEffect(() => {
    setData(null)
    setError('')
    void refresh().catch(() => {})
    return invalidate
  }, [refresh, invalidate])
  useEffect(() => {
    const update = () => {
      void refresh().catch(() => {})
    }
    const visible = () => {
      if (document.visibilityState === 'visible') update()
    }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  return { data, error, refresh }
}
