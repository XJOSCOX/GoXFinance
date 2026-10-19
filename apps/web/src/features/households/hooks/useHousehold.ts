import { createContext, useContext } from 'react'
import type { HouseholdSummary } from '@goxfinance/shared'

export type HouseholdContextValue = {
  households: HouseholdSummary[]
  selected: HouseholdSummary | null
  loading: boolean
  error: string
  refresh: () => Promise<void>
  create: (name: string) => Promise<HouseholdSummary>
  select: (householdId: string) => void
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function useHousehold() {
  const context = useContext(HouseholdContext)
  if (!context) throw new Error('HouseholdProvider missing')
  return context
}
