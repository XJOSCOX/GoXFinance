import { useState } from 'react'
import type { FinancialCategory } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { useNotify } from '../../../components/ui/useNotify'
import { errorMessage } from '../../../lib/api'
import { useCategories } from '../hooks/useCategories'
import { updateCategory } from '../api/categoryClient'
import { CategoryEditor } from './CategoryEditor'
import { CategoryTotals } from './CategoryTotals'

export function CategoryManager({
  home,
  onClose,
  onChanged,
}: {
  home: string
  onClose: () => void
  onChanged?: (category?: FinancialCategory) => Promise<void>
}) {
  const { categories, canManage, loading, error, refresh } = useCategories(home)
  const [query, setQuery] = useState(''),
    [edit, setEdit] = useState<FinancialCategory | null | undefined>(),
    [busy, setBusy] = useState(false)
  const notify = useNotify()
  const [reportOpen, setReportOpen] = useState(false)
  async function changed(category?: FinancialCategory) {
    await refresh()
    await onChanged?.(category)
    setEdit(undefined)
  }
  return (
    <Modal title="Manage categories" onClose={onClose} className="max-w-2xl">
      <p className="mb-4 text-xs text-slate-400">
        One catalog for bills, debt obligations, and expense splits. Archiving preserves all
        historical records.
      </p>
      <details
        className="mb-4 rounded-lg border border-white/10 p-3"
        onToggle={(event) => setReportOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm text-[#b1beb0]">Category totals</summary>
        {reportOpen && <CategoryTotals home={home} categories={categories} />}
      </details>
      <div className="mb-4 flex gap-2">
        <Input
          aria-label="Search categories"
          placeholder="Search categories…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {canManage && (
          <Button
            type="button"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setEdit(null)}
          >
            Add category
          </Button>
        )}
      </div>
      {edit !== undefined && (
        <CategoryEditor
          key={edit?.id ?? 'new'}
          home={home}
          category={edit ?? undefined}
          onCancel={() => setEdit(undefined)}
          onSaved={changed}
        />
      )}
      {loading && (
        <p role="status" className="py-3 text-sm text-slate-400">
          Loading categories…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="mt-3 divide-y divide-white/[.07]">
        {categories
          .filter((category) => category.name.toLowerCase().includes(query.toLowerCase()))
          .map((category) => (
            <div key={category.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {category.name}
                  {category.archived && (
                    <span className="ml-2 text-xs text-slate-500">Archived</span>
                  )}
                </p>
                {category.description && (
                  <p className="mt-1 break-words text-xs text-slate-400">{category.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {category.usage.bills} bills · {category.usage.billPeriods} periods ·{' '}
                  {category.usage.debts} debts · {category.usage.expenses} expenses
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="small"
                    disabled={busy}
                    onClick={() => setEdit(category)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    disabled={busy}
                    onClick={async () => {
                      if (busy) return
                      setBusy(true)
                      try {
                        await updateCategory(home, category, {
                          name: category.name,
                          description: category.description,
                          icon: category.icon,
                          archived: !category.archived,
                        })
                        notify(
                          'success',
                          category.archived ? 'Category restored' : 'Category archived',
                        )
                        await changed()
                      } catch (failure) {
                        notify('error', errorMessage(failure))
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    {category.archived ? 'Restore' : 'Archive'}
                  </Button>
                </div>
              )}
            </div>
          ))}
      </div>
      {!loading &&
        categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase()))
          .length === 0 && <p className="py-5 text-sm text-slate-400">No matching categories.</p>}
    </Modal>
  )
}
