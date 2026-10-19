import { useState } from 'react'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { useCategories } from '../hooks/useCategories'
import { CategoryManager } from './CategoryManager'

export function CategoryPicker({
  home,
  value,
  label,
  optional = false,
  onChange,
}: {
  home: string
  value?: string | null
  label?: string
  optional?: boolean
  onChange: (id: string | null, name: string) => void
}) {
  const { categories, canManage, loading, error, refresh } = useCategories(home)
  const [query, setQuery] = useState(''),
    [manage, setManage] = useState(false)
  const selected =
    value ??
    categories.find((category) => category.name.toLowerCase() === label?.toLowerCase())?.id ??
    ''
  const options = categories.filter(
    (category) =>
      (category.id === selected || !category.archived) &&
      (category.id === selected || category.name.toLowerCase().includes(query.toLowerCase())),
  )
  return (
    <div className="space-y-2">
      <FormField label="Category">
        <Select
          aria-label="Category"
          value={selected}
          disabled={loading}
          onChange={(event) => {
            const category = categories.find((item) => item.id === event.target.value)
            onChange(category?.id ?? null, category?.name ?? 'Other')
          }}
        >
          <option value="">
            {optional
              ? 'No category'
              : loading
                ? 'Loading categories…'
                : categories.length
                  ? 'Select category'
                  : label || 'Select category'}
          </option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archived ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
      </FormField>
      <Input
        aria-label="Search available categories"
        placeholder="Search categories…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <p role="status" className="text-xs text-rose-300">
          {error}
          <Button type="button" size="small" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      )}
      {canManage && (
        <Button type="button" size="small" variant="ghost" onClick={() => setManage(true)}>
          Add / manage categories
        </Button>
      )}
      {manage && (
        <CategoryManager
          home={home}
          onClose={() => setManage(false)}
          onChanged={async (category) => {
            await refresh()
            if (category && !category.archived) {
              onChange(category.id, category.name)
              setManage(false)
            }
          }}
        />
      )}
    </div>
  )
}
