import { calculateDebtSummary, createDebtSchema, updateDebtSchema, type Debt, type DebtValues, type PublicUser } from '@goxfinance/shared'
import type { HouseholdRepository } from '../households/household.repository'
import type { MemberRepository } from '../households/member.repository'
import type { DebtRepository } from './debt.repository'

export class DebtError extends Error {
  constructor(message: string, public statusCode: number) { super(message) }
}

export function debtService(households: HouseholdRepository, members: MemberRepository, repository: DebtRepository) {
  function context(user: PublicUser, householdId: string) {
    const role = households.findRole(householdId, user.id)?.role
    if (!role) throw new DebtError('Household not found', 404)
    const household = households.findHousehold(householdId)!
    const allMembers = members.list(householdId)
    const self = allMembers.find(member => member.linkedUserId === user.id && member.status === 'active')
    return { role, household, allMembers, self }
  }
  function validateAssignments(user: PublicUser, householdId: string, values: DebtValues, existing?: Debt) {
    const ctx = context(user, householdId)
    for (const assignment of values.memberAssignments) {
      const member = ctx.allMembers.find(item => item.id === assignment.memberId)
      if (!member || (member.status !== 'active' && !existing?.memberAssignments.some(item => item.memberId === member.id))) {
        throw new DebtError('Select active members from this household', 400)
      }
      if (ctx.role !== 'owner' && member.linkedUserId === ctx.household.createdByUserId &&
        !existing?.memberAssignments.some(item => item.memberId === member.id && item.responsibility === assignment.responsibility)) {
        throw new DebtError('Only the Owner can assign the Owner to a debt', 403)
      }
      if (ctx.role === 'editor' && member.id !== ctx.self?.id &&
        !existing?.memberAssignments.some(item => item.memberId === member.id && item.responsibility === assignment.responsibility)) {
        throw new DebtError('Editors may only assign their own member record', 403)
      }
    }
    if (values.linkedOriginalDebtId) {
      const original = repository.find(householdId, values.linkedOriginalDebtId)
      if (!original || original.isArchived) throw new DebtError('Original debt not found in this household', 400)
      if (ctx.role !== 'owner') canEdit(user, original, false)
    }
  }
  function get(user: PublicUser, householdId: string, debtId: string) {
    context(user, householdId)
    const debt = repository.find(householdId, debtId)
    if (!debt) throw new DebtError('Debt not found', 404)
    return debt
  }
  function canEdit(user: PublicUser, debt: Debt, archive: boolean) {
    const ctx = context(user, debt.householdId)
    if (ctx.role === 'owner') return
    if (ctx.role === 'viewer') throw new DebtError('Permission denied', 403)
    const ownerExclusive = debt.memberAssignments.every(assignment =>
      ctx.allMembers.find(member => member.id === assignment.memberId)?.linkedUserId === ctx.household.createdByUserId)
    if (ownerExclusive) throw new DebtError('Only the Owner can manage this debt', 403)
    const responsible = debt.memberAssignments.some(assignment => assignment.memberId === ctx.self?.id)
    if (debt.createdByUserId !== user.id && !responsible) throw new DebtError('Permission denied', 403)
    if (archive && ctx.role === 'editor' && debt.memberAssignments.some(assignment => assignment.memberId !== ctx.self?.id)) {
      throw new DebtError('Editors may only archive their own debts', 403)
    }
  }
  return {
    list(user: PublicUser, householdId: string) {
      context(user, householdId)
      const items = repository.list(householdId)
      return { debts: items, summary: calculateDebtSummary(items) }
    },
    get,
    create(user: PublicUser, householdId: string, input: unknown) {
      const ctx = context(user, householdId)
      if (ctx.role === 'viewer') throw new DebtError('Permission denied', 403)
      const values = createDebtSchema.parse(input)
      validateAssignments(user, householdId, values)
      return repository.create(householdId, user.id, values)
    },
    update(user: PublicUser, householdId: string, debtId: string, input: unknown) {
      const current = get(user, householdId, debtId)
      if (current.isArchived) throw new DebtError('Restore this debt before editing', 409)
      canEdit(user, current, false)
      const patch = updateDebtSchema.parse(input)
      const changes = Object.fromEntries(Object.keys(input as object).map(key => [key, patch[key as keyof typeof patch]]))
      if (changes.memberAssignments && context(user, householdId).role !== 'owner' &&
        JSON.stringify(changes.memberAssignments) !== JSON.stringify(current.memberAssignments)) {
        throw new DebtError('Only the Owner can change responsible members', 403)
      }
      const fields = {
        creditorName: current.creditorName, accountNickname: current.accountNickname, accountType: current.accountType,
        accountStatus: current.accountStatus, paymentStatus: current.paymentStatus,
        originalBalanceCents: current.originalBalanceCents, currentBalanceCents: current.currentBalanceCents,
        pastDueAmountCents: current.pastDueAmountCents, creditLimitCents: current.creditLimitCents,
        interestRateApr: current.interestRateApr, minimumPaymentCents: current.minimumPaymentCents,
        dueDay: current.dueDay, nextDueDate: current.nextDueDate, lastPaymentDate: current.lastPaymentDate,
        openedDate: current.openedDate, closedDate: current.closedDate, chargedOffDate: current.chargedOffDate,
        collectionAgency: current.collectionAgency, originalCreditor: current.originalCreditor,
        linkedOriginalDebtId: current.linkedOriginalDebtId, duplicateLinkVerified: current.duplicateLinkVerified,
        balanceVerifiedAt: current.balanceVerifiedAt, confidence: current.confidence,
        notes: current.notes, memberAssignments: current.memberAssignments,
      }
      const values = createDebtSchema.parse({ ...fields, ...changes })
      if (values.linkedOriginalDebtId === debtId) throw new DebtError('A debt cannot link to itself', 400)
      validateAssignments(user, householdId, values, current)
      return repository.update(householdId, debtId, values)
    },
    archive(user: PublicUser, householdId: string, debtId: string) {
      const current = get(user, householdId, debtId)
      canEdit(user, current, true)
      if (repository.list(householdId).some(debt => !debt.isArchived && debt.linkedOriginalDebtId === debtId)) {
        throw new DebtError('Unlink related collection records before archiving this debt', 409)
      }
      return repository.setArchived(householdId, debtId, true)
    },
    restore(user: PublicUser, householdId: string, debtId: string) {
      const current = get(user, householdId, debtId)
      canEdit(user, current, true)
      return repository.setArchived(householdId, debtId, false)
    },
  }
}

export type DebtService = ReturnType<typeof debtService>
