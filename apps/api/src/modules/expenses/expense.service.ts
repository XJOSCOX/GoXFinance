import {
  createExpenseSchema,
  localBillDate,
  editExpenseSchema,
  type Expense,
  type ExpenseInput,
  type PublicUser,
} from '@goxfinance/shared'
import { FinancialError, type FinancialAccess } from '../households/financial-access'
import type { DebtService } from '../debts/debt.service'
import type { ExpenseRepository } from './expense.repository'

export function expenseService(
  store: ExpenseRepository,
  permissions: FinancialAccess,
  debts: DebtService,
) {
  function flags(
    user: PublicUser,
    home: string,
    record: { responsibleMemberId: string; createdByUserId: string; linkedDebtId: string | null },
  ) {
    const ctx = permissions.context(user, home),
      person = ctx.people.find((item) => item.id === record.responsibleMemberId)
    const ownerLinked = person?.linkedUserId === ctx.home.createdByUserId
    return {
      canManage:
        ctx.role === 'owner' ||
        (ctx.role !== 'viewer' &&
          !ownerLinked &&
          (ctx.self?.id === record.responsibleMemberId || record.createdByUserId === user.id)),
    }
  }
  function find(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const row = store.find(home, id)
    if (!row) throw new FinancialError('Expense not found', 404)
    return row
  }
  function validate(
    user: PublicUser,
    home: string,
    values: ExpenseInput,
    existing?: Pick<ExpenseInput, 'responsibleMemberId' | 'allocations'>,
  ) {
    const ctx = permissions.context(user, home),
      person = ctx.people.find((item) => item.id === values.responsibleMemberId)
    if (values.transactionDate > localBillDate())
      throw new FinancialError(
        'An actual expense cannot have a future transaction date. Use a bill for a planned obligation.',
        400,
      )
    if (ctx.role === 'viewer') throw new FinancialError('Permission denied', 403)
    if (!person || (person.status !== 'active' && person.id !== existing?.responsibleMemberId))
      throw new FinancialError('Select an active household member', 400)
    if (
      ctx.role !== 'owner' &&
      (person.linkedUserId === ctx.home.createdByUserId ||
        (ctx.role === 'editor' && ctx.self?.id !== person.id))
    )
      throw new FinancialError('You cannot assign this member', 403)
    const categories = store.categories(home)
    if (
      values.allocations.some(
        (item) =>
          !categories.some(
            (category) =>
              category.id === item.categoryId &&
              (!category.archived ||
                existing?.allocations.some(
                  (allocation) => allocation.categoryId === item.categoryId,
                )),
          ),
      )
    )
      throw new FinancialError('Select categories from this household', 400)
    if (values.linkedDebtId) {
      const debt = debts.get(user, home, values.linkedDebtId)
      if (debt.accountType !== 'credit_card' || debt.isArchived)
        throw new FinancialError('Select an active credit-card debt', 400)
      // A purchase does not modify the debt balance or create a repayment.
      if (ctx.role !== 'owner') debts.authorizePayment(user, home, debt.id, 'create')
    }
  }
  const view = (user: PublicUser, home: string, row: ReturnType<typeof find>) =>
    ({ ...row, ...flags(user, home, row) }) as Expense
  return {
    list(user: PublicUser, home: string) {
      permissions.context(user, home)
      return {
        expenses: store.list(home).map((row) => view(user, home, row)),
        categories: store.categories(home),
        refunds: store.refunds(home),
      }
    },
    initialize(user: PublicUser, home: string) {
      if (permissions.context(user, home).role !== 'viewer')
        store.transaction(() => store.initialize(home))
    },
    get(user: PublicUser, home: string, id: string) {
      return { expense: view(user, home, find(user, home, id)), audit: store.history(home, id) }
    },
    create(user: PublicUser, home: string, input: unknown) {
      return store.transaction(() => {
        const { expense: values, idempotencyKey } = createExpenseSchema.parse(input)
        validate(user, home, values)
        const existing = store.findKey(home, idempotencyKey)
        if (existing) {
          const canonical = (value: ExpenseInput) =>
            JSON.stringify({
              ...value,
              allocations: [...value.allocations].sort((a, b) =>
                a.categoryId.localeCompare(b.categoryId),
              ),
            })
          const original = createExpenseSchema.shape.expense.parse({
            ...values,
            ...Object.fromEntries(
              Object.keys(values).map((key) => [key, existing[key as keyof typeof existing]]),
            ),
          })
          if (existing.createdByUserId !== user.id || canonical(original) !== canonical(values))
            throw new FinancialError('Submission key already used', 409)
          return view(user, home, existing)
        }
        const row = store.create(home, user.id, idempotencyKey, values)
        store.audit(home, row.id, user.id, 'created', null, row)
        return view(user, home, row)
      })
    },
    update(user: PublicUser, home: string, id: string, input: unknown) {
      return store.transaction(() => {
        const before = find(user, home, id),
          { expense: values, revision } = editExpenseSchema.parse(input)
        if (!flags(user, home, before).canManage)
          throw new FinancialError('Only authorized members can edit this expense', 403)
        if (before.voided || before.revision !== revision)
          throw new FinancialError('Expense changed or was voided. Refresh before editing.', 409)
        validate(user, home, values, before)
        const after = store.update(home, id, revision, values)
        store.audit(home, id, user.id, 'corrected', before, after)
        return view(user, home, after)
      })
    },
    void(user: PublicUser, home: string, id: string, revision: number) {
      return store.transaction(() => {
        const before = find(user, home, id)
        if (!flags(user, home, before).canManage)
          throw new FinancialError('Only authorized members can void this expense', 403)
        if (before.voided || before.revision !== revision)
          throw new FinancialError('Expense changed or was already voided', 409)
        store.void(home, id, revision)
        store.audit(home, id, user.id, 'voided', before, store.find(home, id))
        return view(user, home, store.find(home, id)!)
      })
    },
  }
}
export type ExpenseService = ReturnType<typeof expenseService>
