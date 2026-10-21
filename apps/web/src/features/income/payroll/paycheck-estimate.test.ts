import { expect, it } from 'vitest'
import { paycheckEstimateHours } from './paycheck-estimate'
import { profile } from '../../../../../../packages/shared/src/payroll.fixture'
import type { PayrollProfile } from '@goxfinance/shared'
const configured = { ...profile, id: 'profile', revision: 1, updatedAt: '' } as PayrollProfile
function fields() {
  const f = new FormData()
  Object.entries({
    start: '2026-11-11',
    end: '2026-11-15',
    payDate: '2026-11-20',
    regularHours: '32',
    regularMinutes: '30',
    regularRate: '25.00',
    overtimeHours: '2',
    overtimeMinutes: '0',
    overtimeRate: '37.50',
    useHistory: 'on',
  }).forEach(([k, v]) => f.set(k, v))
  return f
}
it('keeps selected dates and variable hours, snapshots rates and marks only a forecast', () => {
  expect(paycheckEstimateHours(fields(), configured)).toMatchObject({
    customWorkPeriod: true,
    estimateDeductionsFromHistory: true,
    regularHundredths: 3250,
    overtimeHundredths: 200,
    regularRateCents: 2500,
    workweekEnd: '2026-11-15',
  })
})
it('preserves Deputy hours and minutes in the forecast payload', () => {
  const f = fields()
  f.set('regularHours', '38')
  f.set('regularMinutes', '34')
  f.set('overtimeHours', '1')
  f.set('overtimeMinutes', '15')
  expect(paycheckEstimateHours(f, configured)).toMatchObject({
    regularMinutes: 2314,
    regularHundredths: 3857,
    overtimeMinutes: 75,
    overtimeHundredths: 125,
  })
})
it('rejects missing overtime rate, invalid hours and a payday before period end', () => {
  const f = fields()
  f.delete('overtimeRate')
  expect(() => paycheckEstimateHours(f, configured)).toThrow('overtime rate')
  f.set('overtimeRate', '37.50')
  f.set('regularHours', '32.123')
  expect(() => paycheckEstimateHours(f, configured)).toThrow()
  f.set('regularHours', '32')
  f.set('payDate', '2026-11-10')
  expect(() => paycheckEstimateHours(f, configured)).toThrow()
})
