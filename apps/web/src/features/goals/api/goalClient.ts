import { apiRequest } from '../../../lib/api'
import type { GoalsData } from '@goxfinance/shared'
export const listGoals = (home: string) => apiRequest<GoalsData>(`households/${home}/goals`)
export const saveGoal = (home: string, body: unknown, id?: string, contribution = false) =>
  apiRequest(
    `households/${home}/goals${contribution ? '/contributions' : ''}${id ? '/' + id : ''}`,
    { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) },
  )

export const saveGoalBatch = (home: string, body: unknown) =>
  apiRequest(`households/${home}/goals/batch`, { method: 'POST', body: JSON.stringify(body) })
