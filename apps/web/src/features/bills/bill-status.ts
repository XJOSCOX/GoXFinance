import type { BillPeriodView } from '@goxfinance/shared'
import type { SemanticTone } from '../../components/ui/semantic-tones'

export function billPeriodStatus(
  period: Pick<BillPeriodView, 'dueDate' | 'paymentStatus'>,
  today: string,
): { label: string; tone: SemanticTone } {
  const status = period.paymentStatus
  if (status === 'paid') return { label: 'Paid', tone: 'positive' }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' }
  if (status === 'credited' || status === 'overpaid')
    return { label: status === 'credited' ? 'Credited' : 'Overpaid', tone: 'info' }

  // Compare calendar dates in UTC so daylight-saving changes cannot shift the day count.
  const days = Math.round(
    (Date.parse(`${period.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  )
  const timing =
    days < 0
      ? `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`
      : days === 0
        ? 'Due today'
        : days <= 7
          ? `Due in ${days} ${days === 1 ? 'day' : 'days'}`
          : 'Upcoming'
  return {
    label: status === 'partially_paid' ? `Partially paid · ${timing}` : timing,
    tone: days < 0 ? 'negative' : days <= 3 ? 'warning' : 'info',
  }
}
