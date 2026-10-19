import {
  categoryInputSchema,
  categoryEditSchema,
  normalizeCategoryName,
  type PublicUser,
} from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
import type { CategoryRepository } from './category.repository'

export function categoryService(store: CategoryRepository, access: FinancialAccess) {
  function owner(user: PublicUser, home: string) {
    if (access.context(user, home).role !== 'owner')
      throw new FinancialError('Only the Owner can manage categories', 403)
  }
  function unique(home: string, name: string, id?: string) {
    if (
      store
        .list(home)
        .some(
          (category) =>
            category.id !== id &&
            normalizeCategoryName(category.name) === normalizeCategoryName(name),
        )
    )
      throw new FinancialError(
        'A category with this name already exists, including archived categories',
        409,
      )
  }
  return {
    list(user: PublicUser, home: string) {
      const ctx = access.context(user, home)
      return {
        canManage: ctx.role === 'owner',
        categories: store
          .list(home)
          .map((category) => ({ ...category, usage: store.usage(home, category.id) })),
      }
    },
    create(user: PublicUser, home: string, input: unknown) {
      owner(user, home)
      const values = categoryInputSchema.parse(input)
      return store.transaction(() => {
        unique(home, values.name)
        const category = store.create(home, values)
        return { ...category, usage: store.usage(home, category.id) }
      })
    },
    update(user: PublicUser, home: string, id: string, input: unknown) {
      owner(user, home)
      const values = categoryEditSchema.parse(input)
      return store.transaction(() => {
        const before = store.find(home, id)
        if (!before) throw new FinancialError('Category not found', 404)
        if (before.revision !== values.revision)
          throw new FinancialError('Category changed. Refresh before saving.', 409)
        unique(home, values.name, id)
        const category = store.update(home, id, values)
        return { ...category, usage: store.usage(home, category.id) }
      })
    },
  }
}
