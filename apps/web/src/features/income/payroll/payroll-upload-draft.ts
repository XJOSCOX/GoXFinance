import type { PayrollStatement, PayrollUploadSource } from '@goxfinance/shared'
export function chooseUploadDraft(
  source: PayrollUploadSource | undefined,
  statement: PayrollStatement,
  preferred?: string,
  selected?: string,
) {
  const drafts = source?.drafts ?? []
  if (selected !== undefined) return drafts.some((d) => d.id === selected) ? selected : undefined
  if (preferred && drafts.some((d) => d.id === preferred)) return preferred
  const matches = drafts.filter(
    (d) =>
      (statement.periodStart &&
        statement.periodEnd &&
        d.start <= statement.periodEnd &&
        d.end >= statement.periodStart) ||
      (statement.payDate && d.payDate === statement.payDate),
  )
  return matches.length === 1 ? matches[0].id : undefined
}
