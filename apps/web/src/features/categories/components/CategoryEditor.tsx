import { useState } from 'react'
import { categoryInputSchema, type FinancialCategory } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField } from '../../../components/ui/FormField'
import { errorMessage } from '../../../lib/api'
import { createCategory, updateCategory } from '../api/categoryClient'
import { useNotify } from '../../../components/ui/useNotify'

export function CategoryEditor({
  home,
  category,
  onSaved,
  onCancel,
}: {
  home: string
  category?: FinancialCategory
  onSaved: (category: FinancialCategory) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(category?.name ?? ''),
    [description, setDescription] = useState(category?.description ?? ''),
    [icon, setIcon] = useState(category?.icon ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const notify = useNotify()
  return (
    <form
      className="space-y-3 rounded-xl border border-white/10 p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (busy) return
        setBusy(true)
        try {
          const input = categoryInputSchema.parse({
            name,
            description: description || null,
            icon: icon || null,
          })
          const result = category
            ? await updateCategory(home, category, { ...input, archived: category.archived })
            : await createCategory(home, input)
          notify('success', category ? 'Category updated' : 'Category created')
          await onSaved(result.category)
        } catch (failure) {
          setError(errorMessage(failure))
        } finally {
          setBusy(false)
        }
      }}
    >
      <FormField label="Category name">
        <Input
          placeholder="e.g. Groceries or transportation"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField label="Description (optional)">
        <Input
          placeholder="What this category includes (optional)"
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>
      <FormField label="Icon identifier (optional)">
        <Input
          placeholder="e.g. home, car, heart"
          maxLength={60}
          value={icon}
          onChange={(event) => setIcon(event.target.value)}
        />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save category'}
        </Button>
      </div>
    </form>
  )
}
