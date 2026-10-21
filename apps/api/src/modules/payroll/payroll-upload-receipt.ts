import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { FinancialError } from '../households/financial-access'
const key = randomBytes(32)
export type UploadReceipt = {
  home: string
  actor: string
  digest: string
  receivedAt: string
  weeks: Record<string, number>
  profiles: Record<string, number>
}
export function signUploadReceipt(value: UploadReceipt) {
  const data = Buffer.from(JSON.stringify(value)).toString('base64url')
  return data + '.' + createHmac('sha256', key).update(data).digest('base64url')
}
export function readUploadReceipt(token: string, home: string, actor: string): UploadReceipt {
  const [data, signature, ...rest] = token.split('.'),
    expected = createHmac('sha256', key)
      .update(data ?? '')
      .digest(),
    actual = Buffer.from(signature ?? '', 'base64url')
  if (rest.length || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new FinancialError('Upload preview expired or invalid. Upload again.', 409)
  const value = JSON.parse(Buffer.from(data, 'base64url').toString()) as UploadReceipt
  if (
    value.home !== home ||
    value.actor !== actor ||
    Date.now() - Date.parse(value.receivedAt) > 30 * 60 * 1000
  )
    throw new FinancialError(
      'Upload preview expired or belongs to another session. Upload again.',
      409,
    )
  return value
}
