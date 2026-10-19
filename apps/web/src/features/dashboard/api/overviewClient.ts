import type { HouseholdOverview } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
export const getOverview = (home: string, month: string) =>
  apiRequest<HouseholdOverview>(`households/${home}/overview?month=${encodeURIComponent(month)}`)
