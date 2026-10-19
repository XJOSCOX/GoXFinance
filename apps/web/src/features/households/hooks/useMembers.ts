import { useCallback, useEffect, useState } from 'react'
import type { HouseholdMember } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { createMember, deactivateMember, listMembers, updateMember, type MemberInput } from '../api/householdClient'

export function useMembers(householdId: string) {
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setMembers((await listMembers(householdId)).members) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setLoading(false) }
  }, [householdId])

  useEffect(() => { void refresh() }, [refresh])

  async function save(memberId: string | null, input: MemberInput) {
    const result = memberId ? await updateMember(householdId, memberId, input) : await createMember(householdId, input)
    setMembers(current => memberId ? current.map(member => member.id === memberId ? { ...result.member, invitation: member.invitation } : member)
      : current.some(member => member.id === result.member.id) ? current : [...current, result.member])
    return result.member
  }

  async function deactivate(memberId: string) {
    await deactivateMember(householdId, memberId)
    setMembers(current => current.map(member => member.id === memberId
      ? { ...member, status: 'inactive', linkedUserId: null, accessRole: null, invitation: null } : member))
  }

  return { members, loading, error, refresh, save, deactivate }
}
