import { expect, it } from 'vitest'
import { matchPayrollSources } from './payroll-source-matching'
import { statement } from './payroll.fixture'
import { profile } from '../../../../../packages/shared/src/payroll.fixture'
const sources = [
  {
    id: 'a',
    name: 'Fictional assignment',
    profile: { ...profile, id: 'p', revision: 1, updatedAt: '2026-10-20', sourceId: 'a' },
  },
  { id: 'b', name: 'Other source', profile: null },
]
it('matches issuer aliases and remembered reviewed imports, and leaves ambiguous matches unresolved', () => {
  expect(matchPayrollSources(statement, sources, [])).toEqual(['a'])
  expect(
    matchPayrollSources({ ...statement, employer: 'New Issuer LLC' }, sources, [
      { sourceId: 'b', employer: 'New Issuer, LLC', assignment: null },
    ]),
  ).toEqual(['b'])
  expect(
    matchPayrollSources(statement, sources, [
      { sourceId: 'b', employer: statement.employer, assignment: null },
    ]),
  ).toEqual(['a', 'b'])
  expect(
    matchPayrollSources({ ...statement, employer: null, assignment: null }, sources, []),
  ).toEqual([])
})
