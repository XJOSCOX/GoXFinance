import { describe, expect, it } from 'vitest'
import { estimatedGross, confirmationState, incomeHistory } from './paychecks'
import { incomeSchema, incomeTransactionSchema, newBase } from './schema'

const source = incomeSchema.parse({ ...newBase('Variable'), amount: null, frequency: 'variable', payType: 'hourly', hourlyRate: 25 })
describe('variable weekly income', () => {
  it('uses entered hours and overtime rather than assuming a 40-hour week', () => {
    expect(estimatedGross(25, 27.5, 3, 1.5)).toBe(800)
    expect(estimatedGross(25, null, 3, 1.5)).toBeNull()
    expect(estimatedGross(25, 30, 0, 2)).toBe(750)
  })
  it('shows Thursday confirmation and missed periods without making income records', () => {
    expect(confirmationState(source, [], '2026-10-22')).toMatchObject({ dueToday: true, confirmedToday: false, missed: false })
    const old = incomeTransactionSchema.parse({ ...newBase('Check'), sourceId: source.id, date: '2026-10-08', amount: 650, confirmationDate: '2026-10-08' })
    expect(confirmationState(source, [old], '2026-10-22').missed).toBe(true)
  })
  it('groups only confirmed deposited net pay and retains gross separately', () => {
    const first = incomeTransactionSchema.parse({ ...newBase('One'), sourceId: source.id, amount: 700, gross: 900, date: '2026-10-08' })
    const second = incomeTransactionSchema.parse({ ...newBase('Two'), sourceId: source.id, amount: 800, gross: 1000, date: '2026-10-15' })
    const history = incomeHistory([first, second])
    expect(history.monthly[0]).toMatchObject({ net: 1500, gross: 1900 })
    expect(history.weeklyAverage).toBe(750)
  })
})
