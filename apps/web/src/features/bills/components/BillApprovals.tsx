import { useState } from 'react'
import {
  billActionLabels,
  type BillChangeRequest,
  type HouseholdMember,
  type Debt,
} from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { reviewBillRequest } from '../api/billClient'
import { errorMessage } from '../../../lib/api'
import { useNotify } from '../../../components/ui/useNotify'
import { BillRequestComparison } from './BillRequestComparison'

export function BillApprovals({
  home,
  requests,
  owner,
  refresh,
  members,
  debts,
}: {
  home: string
  requests: BillChangeRequest[]
  owner: boolean
  refresh: () => Promise<void>
  members: HouseholdMember[]
  debts: Debt[]
}) {
  const [busy, setBusy] = useState(false),
    notify = useNotify()
  async function review(request: BillChangeRequest, action: 'approve' | 'reject' | 'cancel') {
    if (
      busy ||
      !confirm(
        `${action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Withdraw'} this request?`,
      )
    )
      return
    setBusy(true)
    try {
      await reviewBillRequest(home, request.id, action)
      notify('success', 'Review saved')
      await refresh()
    } catch (error) {
      notify('error', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  if (!requests.length) return null
  return (
    <Card className="p-5">
      <details>
        <summary className="cursor-pointer font-semibold">
          {owner ? 'Owner approvals' : 'Your change requests'} ·{' '}
          {requests.filter((item) => item.status === 'pending').length} pending
        </summary>
        <div className="mt-4 space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="rounded-lg border border-white/10 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {request.originalValues.bill.name} · {billActionLabels[request.proposal.action]}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {request.proposedByName} · {new Date(request.createdAt).toLocaleString()} ·{' '}
                    {request.status}
                  </p>
                  <p className="mt-2">{request.reason}</p>
                </div>
                {request.status === 'pending' && (
                  <div className="flex gap-2">
                    {owner ? (
                      <>
                        <Button disabled={busy} onClick={() => void review(request, 'approve')}>
                          Approve
                        </Button>
                        <Button disabled={busy} onClick={() => void review(request, 'reject')}>
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button disabled={busy} onClick={() => void review(request, 'cancel')}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-slate-400">
                  Review original and proposed values
                </summary>
                <BillRequestComparison request={request} members={members} debts={debts} />
              </details>
            </div>
          ))}
        </div>
      </details>
    </Card>
  )
}
