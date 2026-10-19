import type { HouseholdSummary } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'

export function HouseholdOverview({ household, memberCount, canEdit, onDetails, onEdit }: {
  household: HouseholdSummary
  memberCount: number | null
  canEdit: boolean
  onDetails: () => void
  onEdit: () => void
}) {
  return <Card className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Your household</p>
        <h2 className="mt-2 break-words text-2xl font-semibold">{household.name}</h2>
        <p className="mt-2 text-sm text-slate-400">{memberCount === null ? 'Loading members' : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`} · {household.moveInDate
          ? `Living here since ${new Date(`${household.moveInDate}T00:00:00`).toLocaleDateString()}` : 'Move-in date not added'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onDetails}>View details</Button>
        {canEdit && <Button type="button" onClick={onEdit}>Edit household</Button>}
      </div>
    </div>
  </Card>
}
