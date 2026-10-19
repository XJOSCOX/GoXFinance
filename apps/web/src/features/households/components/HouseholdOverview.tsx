import type { HouseholdSummary } from '@goxfinance/shared'
import type { ReactNode } from 'react'
import { Button, Card } from '../../../components/ui'

export function HouseholdOverview({ household, canEdit, canAdd, canPropose, onDetails, onEdit, onJoin, onAdd, children }: {
  household: HouseholdSummary
  canEdit: boolean
  canAdd: boolean
  canPropose: boolean
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
    <div className="mt-6 border-t border-white/10 pt-4">
      {(canAdd || canPropose) && <div className="flex justify-end"><Button type="button" variant="primary" size="small" onClick={onAdd}>{canAdd ? 'Add member' : 'Propose member'}</Button></div>}
      {children}
    </div>
  </Card>
}
