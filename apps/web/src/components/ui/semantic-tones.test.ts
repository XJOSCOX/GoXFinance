import { describe, expect, it } from 'vitest'
import { amountTone, statusTone } from './semantic-tones'

describe('financial status semantics', () => {
  it('keeps pending and estimated values distinct from completed transactions', () => {
    expect(statusTone('completed')).toBe('positive')
    expect(statusTone('confirmed')).toBe('positive')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('scheduled')).toBe('info')
    expect(statusTone('estimated')).toBe('info')
    expect(statusTone('unverified')).toBe('warning')
  })

  it('recognizes delinquency and normalizes database status codes', () => {
    for (const status of ['past_due', 'charged-off', 'collections', '120_days_late', 'failed']) {
      expect(statusTone(status)).toBe('negative')
    }
    expect(statusTone('partially_paid')).toBe('warning')
    expect(statusTone('cancelled')).toBe('neutral')
    expect(statusTone('unrecognized')).toBe('neutral')
  })

  it('distinguishes profit, loss, zero and unavailable results', () => {
    expect(amountTone(15000)).toBe('positive')
    expect(amountTone(-10000)).toBe('negative')
    expect(amountTone(0)).toBe('neutral')
    expect(amountTone(null)).toBe('neutral')
    expect(amountTone(undefined)).toBe('neutral')
  })
})
