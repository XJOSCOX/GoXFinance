import { formatMoney as money } from '../../../lib/money'
import { FileText } from 'lucide-react'
import type { DebtBalanceHistory, DebtPaymentOverview } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'

export function BalanceHistory({
  history,
  overview,
  canVerify,
  onVerify,
  requestMode = false,
}: {
  history: DebtBalanceHistory[]
  overview: DebtPaymentOverview
  canVerify: boolean
  onVerify: () => void
  requestMode?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-slate-400">Last verified creditor balance</p>
          <p className="mt-2 text-xl font-semibold">
            {overview.lastVerifiedBalanceCents === null
              ? 'Unknown'
              : money(overview.lastVerifiedBalanceCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {overview.verifiedBalanceDate ?? 'No verified date'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-400">Principal-only estimate</p>
          <p className="mt-2 text-xl font-semibold">
            {overview.estimatedOutstandingCents === null
              ? 'Unknown'
              : money(overview.estimatedOutstandingCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {overview.ambiguousSameDayCount
              ? 'Payment and statement dates overlap; verify a later balance'
              : overview.unknownPrincipalCount
                ? `${overview.unknownPrincipalCount} payment(s) have unknown principal`
                : 'Excludes unreported interest and fees'}
          </p>
        </Card>
      </div>
      <p className="text-xs leading-5 text-slate-400">
        Only completed payments with known principal after the verification date reduce this
        estimate. Earlier payments and unknown principal are never assumed to reduce the balance.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Balance history</h3>
          <p className="mt-1 text-xs text-slate-500">
            Previous statements remain available after each new verification.
          </p>
        </div>
        {canVerify && (
          <Button variant="primary" size="small" onClick={onVerify}>
            {requestMode ? 'Request balance change' : 'Record verified balance'}
          </Button>
        )}
      </div>
      {history.length ? (
        <div className="space-y-2">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[.08] bg-white/[.025] p-4"
            >
              <div>
                <p className="font-medium">{money(entry.balanceCents)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {entry.effectiveDate} · {entry.source.replaceAll('_', ' ')}
                </p>
                {entry.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{entry.notes}</p>
                )}
              </div>
              <span className="rounded-md border border-[#aab9a9]/[.15] bg-[#aab9a9]/[.07] px-2 py-1 text-xs text-[#b7c7b5]">
                Recorded
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center px-6 py-10 text-center">
          <FileText size={22} className="text-[#aab9a9]" />
          <p className="mt-3 text-sm font-medium">No statements recorded</p>
          <p className="mt-1 text-xs text-slate-400">
            Add a creditor statement when you have a verified balance.
          </p>
        </Card>
      )}
    </div>
  )
}
