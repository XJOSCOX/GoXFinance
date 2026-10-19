import { useState } from 'react'
import { Button } from '../../../components/ui'
import { CategoryManager } from './CategoryManager'
export function ManageCategoriesButton({
  home,
  onChanged,
}: {
  home: string
  onChanged?: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Manage categories
      </Button>
      {open && (
        <CategoryManager
          home={home}
          onClose={() => setOpen(false)}
          onChanged={async () => {
            await onChanged?.()
          }}
        />
      )}
    </>
  )
}
