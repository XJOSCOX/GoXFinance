import {
  debtObligationGroups,
  type Bill,
  type BillInput,
  type PublicUser,
} from '@goxfinance/shared'
import type { HouseholdRepository } from '../households/household.repository'
import type { MemberRepository } from '../households/member.repository'
import type { DebtService } from '../debts/debt.service'
import type { BillRepository } from './bill.repository'

import { FinancialError as BillError, financialAccess } from '../households/financial-access'
export { FinancialError as BillError } from '../households/financial-access'

type User = Pick<PublicUser, 'id'>
export function billPermissions(
  homes: HouseholdRepository,
  members: MemberRepository,
  debts: DebtService,
  store: BillRepository,
) {
  const { context } = financialAccess(homes, members)
  function linkedDebts(user: User, bill: Bill) {
    const ids = new Set(
      [
        bill.linkedDebtId,
        ...store.periods(bill.householdId, bill.id).map((period) => period.linkedDebtId),
      ].filter((id): id is string => !!id),
    )
    return [...ids].map((id) => debts.get(user, bill.householdId, id))
  }
  function flags(user: User, bill: Bill) {
    const ctx = context(user, bill.householdId),
      ownerMember = ctx.people.find((member) => member.linkedUserId === ctx.home.createdByUserId)
    const ownerLinked =
      !!ownerMember &&
      (bill.memberIds.includes(ownerMember.id) ||
        linkedDebts(user, bill).some((debt) =>
          debt.memberAssignments.some((item) => item.memberId === ownerMember.id),
        ))
    const exclusive =
      !!ownerMember &&
      (bill.memberIds.every((id) => id === ownerMember.id) ||
        linkedDebts(user, bill).some((debt) =>
          debt.memberAssignments.every((item) => item.memberId === ownerMember.id),
        ))
    const responsible =
      bill.memberIds.includes(ctx.self?.id ?? '') || bill.createdByUserId === user.id
    return {
      canManage: ctx.role === 'owner' || (ctx.role !== 'viewer' && !exclusive && responsible),
      requiresApproval: ctx.role !== 'owner' && ownerLinked,
    }
  }
  function manage(user: User, bill: Bill, direct = true) {
    const permissions = flags(user, bill)
    if (!permissions.canManage)
      throw new BillError('Only authorized members can manage this obligation', 403)
    if (direct && permissions.requiresApproval)
      throw new BillError('The household Owner must approve this change', 403)
  }
  function validate(user: PublicUser, householdId: string, input: BillInput, current?: Bill) {
    const ctx = context(user, householdId)
    if (ctx.role === 'viewer') throw new BillError('Permission denied', 403)
    const category = store.resolveCategory(
      householdId,
      input.categoryId,
      input.category,
      current?.categoryId,
    )
    input.categoryId = category.id
    input.category = category.name
    if (current && current.kind !== input.kind)
      throw new BillError('A bill cannot change between recurring and one-time', 409)
    for (const id of input.memberIds) {
      const member = ctx.people.find((item) => item.id === id)
      if (!member || (member.status !== 'active' && !current?.memberIds.includes(id)))
        throw new BillError('Select active members from this household', 400)
      if (ctx.role !== 'owner' && member.linkedUserId === ctx.home.createdByUserId)
        throw new BillError('Only the Owner can assign the Owner', 403)
      if (ctx.role === 'editor' && id !== ctx.self?.id && !current?.memberIds.includes(id))
        throw new BillError('Editors may assign only themselves', 403)
    }
    if (input.linkedDebtId) {
      const debt = debts.get(user, householdId, input.linkedDebtId)
      if (debt.isArchived) throw new BillError('Select an active debt', 400)
      if (ctx.role !== 'owner') debts.authorizePayment(user, householdId, debt.id, 'modify')
      const group = debtObligationGroups(debts.list(user, householdId).debts).find((items) =>
        items.some((item) => item.id === debt.id),
      )!
      if (
        input.status === 'active' &&
        store
          .list(householdId)
          .some(
            (bill) =>
              bill.id !== current?.id &&
              bill.status === 'active' &&
              group.some((item) => item.id === bill.linkedDebtId),
          )
      )
        throw new BillError('This debt obligation already has an active bill', 409)
    }
  }
  return {
    context,
    flags,
    manage,
    validate,
    linkedDebts,
    requireOwner(user: User, householdId: string) {
      if (context(user, householdId).role !== 'owner')
        throw new BillError('Only the Owner can review changes', 403)
    },
    guardDebtPayment(user: PublicUser, householdId: string, _debtId: string, paymentId: string) {
      const linked = store.linkedPayment(householdId, paymentId)
      if (linked) {
        const bill = store.find(householdId, linked.billId)
        if (bill) manage(user, bill)
      }
    },
  }
}
export type BillPermissions = ReturnType<typeof billPermissions>
