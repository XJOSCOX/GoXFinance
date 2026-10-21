import type { BudgetReport } from '@goxfinance/shared'
import { Button } from '../../../components/ui'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { InfoHint } from '../../../components/ui/InfoHint'

export function BudgetPageActions({
  data,
  edit,
  copy,
  audit,
  categories,
  refresh,
}: {
  data: BudgetReport
  edit: () => void
  copy: () => void
  audit: () => void
  categories: () => void
  refresh: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {data.budget?.canManage ? (
        <Button variant="primary" onClick={edit}>
          {data.budget.status === 'archived' ? 'Restore / edit budget' : 'Edit budget'}
        </Button>
      ) : !data.budget && data.canCreate ? (
        <Button variant="primary" onClick={edit}>
          Create budget
        </Button>
      ) : null}
      <ActionMenu
        label="Budget actions"
        items={[
          ...(!data.budget && data.canCreate
            ? [{ label: 'Copy previous / template month', onSelect: copy }]
            : []),
          ...(data.budget ? [{ label: 'Audit history', onSelect: audit }] : []),
          { label: 'Manage categories', onSelect: categories },
          { label: 'Refresh budget', onSelect: refresh },
        ]}
      />
      {data.budget && (
        <InfoHint
          label="Budget record details"
          text={`Created ${new Date(data.budget.createdAt).toLocaleString()} · Updated ${new Date(data.budget.updatedAt).toLocaleString()}`}
        />
      )}
    </div>
  )
}
