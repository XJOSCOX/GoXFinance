import type { FinancialReport, ReportFilters } from '@goxfinance/shared'
export async function downloadReport(
  home: string,
  filters: ReportFilters,
  format: 'pdf' | 'xlsx' | 'csv' | 'json',
) {
  const response = await fetch(`/api/households/${home}/reports/export`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-GoXFinance-Request': '1' },
    body: JSON.stringify({ filters, format }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Unable to export report')
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement('a')
  try {
    link.href = url
    link.download = `goxfinance-${filters.kind}-${filters.from}-${filters.to}.${format}`
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
export type { FinancialReport }
