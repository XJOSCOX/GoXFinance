import { expect, it } from 'vitest'
import { plannerLocalTimestamp } from './planner-time'
it.each([
  ['2026-10-20T20:00', 'America/Chicago', '2026-10-21T01:00:00.000Z'],
  ['2026-12-20T20:00', 'America/Chicago', '2026-12-21T02:00:00.000Z'],
  ['2026-10-20T20:00', 'America/New_York', '2026-10-21T00:00:00.000Z'],
  ['2026-10-20T20:00', 'Asia/Kathmandu', '2026-10-20T14:15:00.000Z'],
  ['2026-10-20T20:00', 'UTC', '2026-10-20T20:00:00.000Z'],
])('resolves %s in %s independently of machine timezone', (value, zone, expected) =>
  expect(plannerLocalTimestamp(value, zone)).toBe(expected),
)
it('rejects nonexistent, ambiguous, invalid dates and unknown zones rather than shifting cash timing', () => {
  expect(() => plannerLocalTimestamp('2026-03-08T02:30', 'America/Chicago')).toThrow(
    'does not exist',
  )
  expect(() => plannerLocalTimestamp('2026-11-01T01:30', 'America/Chicago')).toThrow('occurs twice')
  expect(() => plannerLocalTimestamp('2026-02-30T12:00', 'UTC')).toThrow('valid')
  expect(() => plannerLocalTimestamp('2026-10-20T12:00', 'Fake/Zone')).toThrow('IANA')
})
