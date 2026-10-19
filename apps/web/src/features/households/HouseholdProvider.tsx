import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { HouseholdSummary } from '@goxfinance/shared'
import { useAuth } from '../auth/hooks/useAuth'
import { createHousehold, listHouseholds } from './api/householdClient'
import { HouseholdContext } from './hooks/useHousehold'
import { errorMessage } from '../../lib/api'

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user) return
    setError('')
    try {
      const response = await listHouseholds()
      setHouseholds(response.households)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setLoadedFor(user.id)
    }
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  async function create(name: string) {
    const result = await createHousehold(name)
    setHouseholds(current => current.some(household => household.id === result.household.id)
      ? current : [...current, result.household])
    setSelectedId(result.household.id)
    return result.household
  }

  const visible = user && loadedFor === user.id ? households : []
  const selected = visible.find(household => household.id === selectedId) ?? visible[0] ?? null
  return <HouseholdContext.Provider value={{ households: visible, selected,
    loading: Boolean(user && loadedFor !== user.id), error, refresh, create, select: setSelectedId }}>
    {children}
  </HouseholdContext.Provider>
}
