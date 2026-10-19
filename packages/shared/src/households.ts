import { z } from 'zod'

export const householdRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer'])
export const relationshipSchema = z.enum(['self', 'spouse', 'child', 'parent', 'other'])
export const memberStatusSchema = z.enum(['active', 'inactive'])

export type HouseholdRole = z.infer<typeof householdRoleSchema>
export type Relationship = z.infer<typeof relationshipSchema>
export type MemberStatus = z.infer<typeof memberStatusSchema>

export type HouseholdPermission = 'view' | 'addMember' | 'editMember' | 'removeMember' | 'manageSettings' | 'manageRoles'

const rolePermissions: Record<HouseholdRole, readonly HouseholdPermission[]> = {
  owner: ['view', 'addMember', 'editMember', 'removeMember', 'manageSettings', 'manageRoles'],
  admin: ['view', 'addMember', 'editMember', 'removeMember', 'manageSettings', 'manageRoles'],
  editor: ['view', 'addMember', 'editMember'],
  viewer: ['view'],
}

export function canManageHousehold(role: HouseholdRole, permission: HouseholdPermission): boolean {
  return rolePermissions[role].includes(permission)
}

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'Enter a household name').max(120),
}).strict()
export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'Enter a household name').max(120).optional(),
  moveInDate: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Enter at least one change')

export const createMemberSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(120),
  relationship: relationshipSchema,
  status: memberStatusSchema.default('active'),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict()

export const updateMemberSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(120).optional(),
  relationship: relationshipSchema.optional(),
  status: memberStatusSchema.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Enter at least one change')

export type HouseholdSummary = {
  id: string
  name: string
  moveInDate: string | null
  notes: string | null
  role: HouseholdRole
  createdAt: string
  updatedAt: string
}

export type HouseholdMember = {
  id: string
  householdId: string
  linkedUserId: string | null
  fullName: string
  relationship: Relationship
  status: MemberStatus
  notes: string | null
  accessRole: HouseholdRole | null
  createdAt: string
  updatedAt: string
  invitation?: InvitationSummary | null
}

export const invitationRoleSchema = z.enum(['admin', 'editor', 'viewer'])
export const invitationCodeSchema = z.string().trim().min(1, 'Enter an invitation code').max(200)
export const createInvitationSchema = z.object({ role: invitationRoleSchema }).strict()
export const redeemInvitationSchema = z.object({ code: invitationCodeSchema }).strict()
export type InvitationRole = z.infer<typeof invitationRoleSchema>
export type InvitationStatus = 'pending' | 'redeemed' | 'revoked' | 'expired'
export type InvitationSummary = {
  id: string
  memberId: string
  role?: InvitationRole
  status: InvitationStatus
  createdAt: string
  expiresAt: string
}
