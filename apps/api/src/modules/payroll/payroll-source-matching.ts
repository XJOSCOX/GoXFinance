import type { PayrollStatement, PayrollUploadSource } from '@goxfinance/shared'
const normalize = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
export function matchPayrollSources(
  statement: PayrollStatement,
  sources: PayrollUploadSource[],
  aliases: { sourceId: string; employer: string | null; assignment: string | null }[],
) {
  const employer = normalize(statement.employer),
    assignment = normalize(statement.assignment)
  return sources
    .filter((s) => {
      const known = [
        { employer: s.profile?.employer ?? s.name, assignment: s.profile?.assignment },
        ...aliases.filter((a) => a.sourceId === s.id),
      ]
      return known.some(
        (a) =>
          (employer && normalize(a.employer) === employer) ||
          (assignment && normalize(a.assignment) === assignment) ||
          (assignment && normalize(s.name) === assignment),
      )
    })
    .map((s) => s.id)
}
