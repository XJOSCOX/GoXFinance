import { z } from 'zod'

export const householdRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer'])
export const relationshipSchema = z.enum(['self', 'spouse', 'child', 'parent', 'other'])
export const memberStatusSchema = z.enum(['active', 'inactive'])

export type HouseholdRole = z.infer<typeof householdRoleSchema>
export type Relationship = z.infer<typeof relationshipSchema>
export type MemberStatus = z.infer<typeof memberStatusSchema>

export type HouseholdPermission = 'view' | 'addMember' | 'proposeMember' | 'editMember' | 'removeMember' | 'manageSettings' | 'manageRoles'

const rolePermissions: Record<HouseholdRole, readonly HouseholdPermission[]> = {
  owner: ['view', 'addMember', 'proposeMember', 'editMember', 'removeMember', 'manageSettings', 'manageRoles'],
  admin: ['view', 'proposeMember', 'editMember', 'manageSettings'],
  editor: ['view', 'proposeMember', 'editMember'],
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
  plannedAccessRole: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
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
  plannedAccessRole: InvitationRole
  createdAt: string
  updatedAt: string
  invitation?: InvitationSummary | null
}

export const invitationRoleSchema = z.enum(['admin', 'editor', 'viewer'])
export const invitationCodeSchema = z.string().trim().min(1, 'Enter an invitation code').max(200)
export const createInvitationSchema = z.object({ role: invitationRoleSchema.optional() }).strict()
export const updateMemberRoleSchema = z.object({ role: invitationRoleSchema }).strict()
export const proposeMemberSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a name').max(120),
  relationship: relationshipSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict()
export const reviewMemberRequestSchema = z.object({ role: invitationRoleSchema.default('viewer') }).strict()
export type MemberRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type HouseholdMemberRequest = {
  id: string
  householdId: string
  proposedByUserId: string
  proposedByName: string
  fullName: string
  relationship: Relationship
  notes: string | null
  status: MemberRequestStatus
  reviewedByUserId: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}
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
