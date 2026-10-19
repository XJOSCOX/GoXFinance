import { useCallback, useEffect, useState } from 'react'
import type { HouseholdMemberRequest } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { errorMessage } from '../../../lib/api'
import { listMemberRequests } from '../api/householdClient'
import { MemberRequestReviewDialog } from './MemberRequestReviewDialog'

export function PendingApprovals({ householdId, onMembersChanged }: { householdId: string; onMembersChanged: () => Promise<void> }) {
  const [requests, setRequests] = useState<HouseholdMemberRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [review, setReview] = useState<{ request: HouseholdMemberRequest; action: 'approve' | 'reject' | null } | null>(null)
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setRequests((await listMemberRequests(householdId)).requests); setError('') }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setLoading(false) }
  }, [householdId])
  useEffect(() => { void refresh() }, [refresh])
  async function changed() { await Promise.all([refresh(), onMembersChanged()]) }
  const ordered = [...requests].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || b.createdAt.localeCompare(a.createdAt))

  return <Card className="mt-5 p-5 sm:p-6">
    <h2 className="text-base font-semibold">Pending approvals</h2>
    {loading ? <p className="mt-4 text-sm text-slate-400">Loading requests…</p> : error
      ? <div className="mt-4"><p role="alert" className="text-sm text-rose-300">{error}</p><Button className="mt-3" onClick={() => void refresh()}>Try again</Button></div>
      : ordered.length === 0 ? <p className="mt-4 text-sm text-slate-400">No member requests.</p>
      : <div className="mt-4 space-y-2">{ordered.map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
        <div><p className="font-medium">{request.fullName} <span className="text-sm font-normal capitalize text-slate-400">· {request.relationship}</span></p>
          <p className="mt-1 text-xs text-slate-400">Proposed by {request.proposedByName} · {new Date(request.createdAt).toLocaleDateString()} · <span className="capitalize">{request.status}</span></p>
          {request.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-400">{request.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><Button size="small" onClick={() => setReview({ request, action: null })}>Review details</Button>
          {request.status === 'pending' && <><Button size="small" onClick={() => setReview({ request, action: 'reject' })}>Reject</Button>
            <Button size="small" variant="primary" onClick={() => setReview({ request, action: 'approve' })}>Approve</Button></>}
        </div>
      </div>)}</div>}
    {review && <MemberRequestReviewDialog key={review.request.id} householdId={householdId} request={review.request}
      initialAction={review.action} onClose={() => setReview(null)} onChanged={changed} />}
  </Card>
}
