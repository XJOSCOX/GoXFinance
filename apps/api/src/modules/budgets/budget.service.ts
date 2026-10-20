import { randomUUID } from 'node:crypto'
import {
  budgetSchema,
  budgetCopySchema,
  createTradingSchema,
  editTradingSchema,
  budgetSpending,
  budgetCategoryRows,
  budgetBillObligations,
  budgetUsage,
  previousBudgetMonth,
  sumCents,
  type BudgetInput,
  type Budget,
  type BudgetReport,
  type BillView,
  type Expense,
  type FinancialCategory,
  type PublicUser,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
import type { TradingPermissions } from '../trading/trading.permissions'
import { checkRevision } from '../trading/trading.permissions'
import type { BudgetRepository } from './budget.repository'
type Sources = { bills: BillView[]; expenses: Expense[]; categories: FinancialCategory[] }
export function budgetService(
  store: BudgetRepository,
  permissions: TradingPermissions,
  sources: (user: PublicUser, home: string) => Sources,
) {
  function find(user: PublicUser, home: string, id: string) {
    permissions.context(user, home)
    const old = store.all(home).find((r) => r.id === id)
    if (!old) throw new FinancialError('Budget not found', 404)
    return old
  }
  function replay(user: PublicUser, home: string, key: string, input: unknown) {
    const old = store.all(home).find((r) => r.idempotencyKey === key)
    if (!old) return null
    permissions.manage(user, home, old.responsibleMemberId, true)
    const event = store
      .history(home, old.id)
      .find((a) => ['budget_created', 'budget_copied'].includes(a.action))
    if (
      old.createdByUserId !== user.id ||
      JSON.stringify(JSON.parse(event?.afterJson ?? '{}').input) !== JSON.stringify(input)
    )
      throw new FinancialError('Submission key already used', 409)
    return old
  }
  function write(
    user: PublicUser,
    home: string,
    v: BudgetInput,
    key: string,
    input: unknown,
    old?: ReturnType<typeof find>,
    allowedArchived: string[] = [],
    action = 'budget_created',
  ) {
    permissions.manage(user, home, old?.responsibleMemberId ?? v.responsibleMemberId, !!old)
    permissions.manage(user, home, v.responsibleMemberId, !!old)
    if (old && (old.month !== v.month || old.responsibleMemberId !== v.responsibleMemberId))
      throw new FinancialError(
        'Month and member scope cannot change; copy to another month instead',
        400,
      )
    if (
      store
        .all(home)
        .some(
          (r) =>
            r.id !== old?.id &&
            r.month === v.month &&
            r.responsibleMemberId === v.responsibleMemberId,
        )
    )
      throw new FinancialError(
        'A budget already exists for this month and scope. Edit or restore it.',
        409,
      )
    const categories = sources(user, home).categories
    for (const l of v.limits) {
      const c = categories.find((c) => c.id === l.categoryId)
      if (
        !c ||
        (c.archived &&
          !old?.limits.some((p) => p.categoryId === c.id) &&
          !allowedArchived.includes(c.id))
      )
        throw new FinancialError('Choose an active household category', 400)
    }
    const record = store.write(home, user.id, v, key, old)
    store.audit(home, user.id, record.id, old ? 'budget_corrected' : action, old, record, input)
    return record
  }
  return {
    list(user: PublicUser, home: string, month: string, member: string | null): BudgetReport {
      const ctx = permissions.context(user, home)
      if (member && !ctx.people.some((p) => p.id === member))
        throw new FinancialError('Member not found', 404)
      const data = sources(user, home),
        records = store
          .all(home)
          .map((r) => ({
            ...r,
            canManage: permissions.canManage(user, home, r.responsibleMemberId),
          })) as Budget[],
        budget = records.find((r) => r.month === month && r.responsibleMemberId === member) ?? null,
        active = budget?.status === 'active' ? budget : null
      const actual = budgetSpending(data.expenses, data.bills, month, member),
        actualCents = sumCents(actual.map((r) => r.actualCents)),
        prev = previousBudgetMonth(month),
        previous = records.find(
          (r) => r.month === prev && r.responsibleMemberId === member && r.status === 'active',
        )
      return {
        month,
        responsibleMemberId: member,
        budget,
        records,
        canCreate: permissions.canManage(user, home, member),
        categories: data.categories,
        members: ctx.people.map((p) => ({ id: p.id, fullName: p.fullName, status: p.status })),
        rows: budgetCategoryRows(active, data.categories, actual),
        actualCents,
        remainingCents: active ? budgetUsage(active.totalCents, actualCents).remainingCents : null,
        overCents: active ? budgetUsage(active.totalCents, actualCents).overCents : 0,
        previous: {
          month: prev,
          actualCents: sumCents(
            budgetSpending(data.expenses, data.bills, prev, member).map((r) => r.actualCents),
          ),
          plannedCents: previous?.totalCents ?? null,
        },
        bills: budgetBillObligations(data.bills, month, member),
      }
    },
    save(user: PublicUser, home: string, body: unknown, id?: string) {
      return store.atomic(() => {
        permissions.context(user, home)
        const p = id
            ? editTradingSchema(budgetSchema).parse(body)
            : createTradingSchema(budgetSchema).parse(body),
          old = id ? find(user, home, id) : undefined
        if ('idempotencyKey' in p) {
          const existing = replay(user, home, p.idempotencyKey, p.values)
          if (existing) return existing
        }
        if (old) checkRevision(old.revision, 'revision' in p ? p.revision : 0)
        return write(
          user,
          home,
          p.values,
          'idempotencyKey' in p ? p.idempotencyKey : randomUUID(),
          { ...p.values, ...('reason' in p ? { reason: p.reason } : {}) },
          old,
        )
      })
    },
    copy(user: PublicUser, home: string, body: unknown) {
      return store.atomic(() => {
        permissions.context(user, home)
        const p = createTradingSchema(budgetCopySchema).parse(body),
          existing = replay(user, home, p.idempotencyKey, p.values)
        if (existing) return existing
        const source = find(user, home, p.values.sourceId)
        checkRevision(source.revision, p.values.sourceRevision)
        const v = budgetSchema.parse({
          month: p.values.month,
          responsibleMemberId: source.responsibleMemberId,
          totalCents: source.totalCents,
          notes: source.notes,
          status: 'active',
          limits: source.limits,
        })
        return write(
          user,
          home,
          v,
          p.idempotencyKey,
          p.values,
          undefined,
          source.limits.map((l) => l.categoryId),
          'budget_copied',
        )
      })
    },
    history(user: PublicUser, home: string, id: string) {
      find(user, home, id)
      return store.history(home, id)
    },
  }
}
export type BudgetService = ReturnType<typeof budgetService>
