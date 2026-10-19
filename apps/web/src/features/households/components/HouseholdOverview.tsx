import type { HouseholdSummary } from '@goxfinance/shared'
import type { ReactNode } from 'react'
import { Button, Card } from '../../../components/ui'

export function HouseholdOverview({ household, memberCount, canEdit, canAdd, onDetails, onEdit, onJoin, onAdd, children }: {
  household: HouseholdSummary
  memberCount: number | null
  canEdit: boolean
  canAdd: boolean
  onDetails: () => void
  onEdit: () => void
  onJoin: () => void
  onAdd: () => void
  children: ReactNode
}) {
  return <Card className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold">{household.name}</h1>
        {household.moveInDate && <p className="mt-2 text-sm text-slate-400">Living here since {new Date(`${household.moveInDate}T00:00:00`).toLocaleDateString()}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onDetails}>Details</Button>
        {canEdit && <Button type="button" onClick={onEdit}>Edit household</Button>}
        <Button type="button" onClick={onJoin}>Join another</Button>
      </div>
    </div>
    <div className="mt-7 border-t border-white/10 pt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">People <span className="ml-1 text-sm font-normal text-slate-400">{memberCount === null ? '…' : memberCount}</span></h2>
        {canAdd && <Button type="button" variant="primary" size="small" onClick={onAdd}>Add member</Button>}
      </div>
      {children}
    </div>
  </Card>
}
