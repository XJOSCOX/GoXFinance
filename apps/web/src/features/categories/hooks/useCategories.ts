import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { FinancialCategory } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { listCategories } from '../api/categoryClient'

export function useCategories(home: string) {
  const sequence = useRef(0)
  const invalidate = useCallback(() => {
    sequence.current++
  }, [])
  const [categories, setCategories] = useState<FinancialCategory[]>([]),
    [canManage, setCanManage] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!z.uuid().safeParse(home).success) return
    const request = ++sequence.current
    setLoading(true)
    try {
      const result = await listCategories(home)
      if (request !== sequence.current) return
      setCategories(result.categories)
      setCanManage(result.canManage)
      setError('')
    } catch (failure) {
      if (request === sequence.current) setError(errorMessage(failure))
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [home])
  useEffect(() => {
    setCategories([])
    setCanManage(false)
    void refresh()
    return invalidate
  }, [refresh, invalidate])
  return { categories, canManage, loading, error, refresh }
}
