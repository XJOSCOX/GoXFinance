import type { PlanningData } from '@goxfinance/shared'
import { apiRequest } from '../../../lib/api'
export const listPlanning = (home: string) =>
  apiRequest<PlanningData>(`households/${home}/debt-planning`)
export const savePlanning = (home: string, path: string, body: unknown, edit = false) =>
  apiRequest(`households/${home}/debt-planning/${path}`, {
    method: edit ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
