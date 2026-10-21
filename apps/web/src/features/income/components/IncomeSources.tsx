import {
  upcomingPayday,
  incomeTypeLabels,
  incomeFrequencyLabels,
  type IncomeSource,
  type IncomeTransaction,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Card, Button } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function IncomeSources({
  today,
  sources,
  transactions,
  members,
  upload,
  edit,
  record,
  details,
  archive,
}: {
  today: string
  sources: IncomeSource[]
  transactions: IncomeTransaction[]
  members: HouseholdMember[]
  upload: (v: IncomeSource) => void
  edit: (v: IncomeSource) => void
  record: (v: IncomeSource, date?: string, existing?: IncomeTransaction) => void
  details: (v: IncomeSource) => void
  archive: (v: IncomeSource) => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {sources.length ? (
        sources.map((source) => {
          const payday =
            source.status === 'active' && !source.isArchived ? upcomingPayday(source, today) : null
          const entry = transactions.find(
            (v) => v.sourceId === source.id && v.payDate === payday && v.status !== 'cancelled',
          )
          return (
            <Card key={source.id} className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{source.name}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {incomeTypeLabels[source.incomeType]} ·{' '}
                    {incomeFrequencyLabels[source.frequency]}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {members.find((v) => v.id === source.responsibleMemberId)?.fullName}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {source.isArchived
                    ? 'Archived'
                    : source.status === 'active'
                      ? 'Active'
                      : 'Inactive'}
                </span>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p className="text-slate-400">
                  Expected gross{' '}
                  <span className="block text-[#e8e9e6]">
                    {formatMoney(source.expectedGrossCents)}
                  </span>
                </p>
                <p className="text-slate-400">
                  Expected net{' '}
                  <span className="block text-[#e8e9e6]">
                    {formatMoney(source.expectedNetCents)}
                  </span>
                </p>
              </div>
              {source.incomeType === 'hourly' && (
                <p className="text-xs text-slate-400">
                  Hourly rate {formatMoney(source.hourlyRateCents)} · Hours vary · Overtime ×
                  {source.overtimeMultiplier}
                </p>
              )}
              {payday && (
                <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                  <p>
                    {payday === today ? 'Payday today' : 'Next weekly payday'} · {payday}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry?.status === 'confirmed'
                      ? 'Deposit confirmed.'
                      : entry
                        ? `Paycheck ${entry.status}; not yet received.`
                        : 'No paycheck entered for this date. No income is assumed.'}
                  </p>
                  {source.canManage && entry?.status !== 'confirmed' && (
                    <Button
                      size="small"
                      className="mt-3"
                      onClick={() => record(source, payday, entry)}
                    >
                      {entry ? 'Confirm paycheck' : 'Enter paycheck'}
                    </Button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <Button size="small" onClick={() => details(source)}>
                  Details
                </Button>
                {source.canManage && (
                  <>
                    {!source.isArchived && (
                      <>
                        <Button size="small" onClick={() => edit(source)}>
                          Edit
                        </Button>
                        {source.status === 'active' && source.incomeType !== 'trading_payout' && (
                          <Button size="small" onClick={() => upload(source)}>
                            Upload paycheck
                          </Button>
                        )}
                        {source.status === 'active' && (
                          <Button size="small" onClick={() => record(source)}>
                            Record income
                          </Button>
                        )}
                      </>
                    )}
                    <Button size="small" onClick={() => archive(source)}>
                      {source.isArchived ? 'Restore' : 'Archive'}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )
        })
      ) : (
        <Card className="p-8 text-sm text-slate-400">
          Add an income source to record paychecks. No income has been created automatically.
        </Card>
      )}
    </div>
  )
}
