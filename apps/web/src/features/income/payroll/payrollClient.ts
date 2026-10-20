import { apiRequest } from '../../../lib/api'
import type { PayrollData } from '@goxfinance/shared'
export const payrollBase = (home: string) => `households/${home}/income/payroll`
export const loadPayroll = (home: string) => apiRequest<PayrollData>(payrollBase(home))
export const savePayroll = (
  home: string,
  path: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
) => apiRequest(payrollBase(home) + path, { method, body: JSON.stringify(body) })
export async function encodePaystub(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF/image no larger than 10 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return { mime: file.type, data: btoa(binary) }
}
