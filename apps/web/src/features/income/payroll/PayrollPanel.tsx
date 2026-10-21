import { useCallback, useEffect, useState } from 'react'
import {
  incomeTransactionSchema,
  bankDecimalCents,
  type IncomeSource,
  type IncomeTransaction,
  type PayrollData,
  type PayrollWeek,
} from '@goxfinance/shared'
import { Button, Card, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { DateField, AmountField } from '../../../components/financial/EntryFields'
import { useNotify } from '../../../components/ui/useNotify'
import { apiRequest, errorMessage } from '../../../lib/api'
import { ActionMenu } from '../../../components/ui/ActionMenu'
import { formatMoney } from '../../../lib/money'
import { loadPayroll, savePayroll } from './payrollClient'
import { PayrollProfileForm } from './PayrollProfileForm'
import { PayrollHoursForm } from './PayrollHoursForm'
import { PayrollReviewForm } from './PayrollReviewForm'
import { PayrollReports } from './PayrollReports'
import { PayrollWeekCard } from './PayrollWeekCard'
import { PaystubUpload, type PaystubPreview } from './PaystubUpload'
type EditorBody = { values: unknown; revision: number; reason: string }
export function PayrollPanel({
  home,
  sources,
  transactions,
  changed,
  preferredSourceId,
}: {
  home: string
  sources: IncomeSource[]
  transactions: IncomeTransaction[]
  changed: () => void
  preferredSourceId?: string
}) {
  const notify = useNotify(),
    [data, setData] = useState<PayrollData>({ profiles: [], weeks: [], canManage: false }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [sourceId, setSourceId] = useState(preferredSourceId ?? ''),
    [tab, setTab] = useState('weeks'),
    [settings, setSettings] = useState(false),
    [hours, setHours] = useState<PayrollWeek | null | undefined>(),
    [upload, setUpload] = useState<PayrollWeek>(),
    [review, setReview] = useState<{ week: PayrollWeek; preview: PaystubPreview }>(),
    [deposit, setDeposit] = useState<PayrollWeek>(),
    [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setData(await loadPayroll(home))
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [home])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const available = sources.filter(
      (s) =>
        s.incomeType !== 'trading_payout' &&
        !s.isArchived &&
        (s.canManage || data.profiles.some((p) => p.sourceId === s.id)),
    ),
    source = available.find((s) => s.id === sourceId) ?? available[0],
    profile = data.profiles.find((p) => p.sourceId === source?.id),
    weeks = data.weeks
      .filter((w) => w.sourceId === source?.id)
      .sort((a, b) => b.workweekStart.localeCompare(a.workweekStart))
  async function persist(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown) {
    try {
      await savePayroll(home, path, method, body)
      await refresh()
      notify('success', 'Payroll saved to the database')
    } catch (e) {
      notify('error', errorMessage(e))
      throw e
    }
  }
  if (loading) return <p role="status">Loading payroll…</p>
  if (error)
    return (
      <Card className="p-4">
        <p role="alert">{error}</p>
        <Button onClick={() => void refresh()}>Retry</Button>
      </Card>
    )
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField label="Payroll income source">
          <Select value={source?.id ?? ''} onChange={(e) => setSourceId(e.target.value)}>
            {!available.length && <option value="">Choose a payroll source</option>}
            {available.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        {source?.canManage && (
          <ActionMenu
            label="Payroll actions"
            items={[
              { label: 'Payroll settings', onSelect: () => setSettings(true) },
              { label: 'Report hours', onSelect: () => setHours(null), disabled: !profile },
            ]}
          />
        )}
      </div>
      {!profile ? (
        <Card className="p-5 text-sm text-slate-400">
          Upload a paycheck above to detect the employer and schedule, or configure payroll settings
          for manual hours. No earnings are assumed.
        </Card>
      ) : (
        <>
          <div
            className="flex gap-5 border-b border-white/10"
            role="tablist"
            aria-label="Payroll views"
          >
            {[
              ['weeks', 'Paychecks & forecasts'],
              ['tax', 'Taxes & comparison'],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`border-b-2 pb-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b8a9] ${tab === id ? 'border-[#b1beb0] text-white' : 'border-transparent text-slate-500'}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'tax' ? (
            <PayrollReports weeks={weeks} profile={profile} />
          ) : (
            <>
              {!weeks.length && (
                <Card className="p-5 text-sm text-slate-400">
                  Upload a paycheck from Income, or report hours to save a forecast before your
                  statement arrives.
                </Card>
              )}
              {weeks.map((w) => (
                <PayrollWeekCard
                  key={w.id}
                  week={w}
                  transaction={transactions.find((t) => t.id === w.incomeTransactionId)}
                  profile={profile}
                  busy={busy}
                  edit={() => setHours(w)}
                  upload={() => setUpload(w)}
                  review={() =>
                    setReview({
                      week: w,
                      preview: {
                        statement: w.statement!,
                        warnings: [],
                        documentDigest: null,
                        revision: w.revision,
                      },
                    })
                  }
                  confirm={() => setDeposit(w)}
                  receive={async (v) => {
                    const transaction = transactions.find((t) => t.id === w.incomeTransactionId)
                    if (!transaction)
                      throw new Error('Refresh Income before confirming this deposit')
                    const values = incomeTransactionSchema.strip().parse({
                      ...transaction,
                      status: 'confirmed',
                      depositDate: v.date,
                      receiptConfirmed: true,
                      actualNetCents: v.amountCents,
                    })
                    await apiRequest(`households/${home}/income/transactions/${transaction.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        revision: transaction.revision,
                        reason: 'User confirmed paycheck received',
                        values,
                      }),
                    })
                    await refresh()
                    notify('success', 'Paycheck received')
                    changed()
                  }}
                  pending={async () => {
                    if (busy) return
                    setBusy(true)
                    try {
                      await persist(`/weeks/${w.id}/pending`, 'POST', { revision: w.revision })
                    } catch {
                      /* Notification is shown by persist. */
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              ))}
            </>
          )}
        </>
      )}
      {settings && source && (
        <PayrollProfileForm
          weeks={data.weeks}
          source={source}
          profile={profile}
          close={() => setSettings(false)}
          save={(body) => persist('/profile', 'PUT', body)}
        />
      )}
      {hours !== undefined && profile && (
        <PayrollHoursForm
          profile={{ ...profile, payFrequency: profile.payFrequency ?? source?.frequency }}
          week={hours ?? undefined}
          close={() => setHours(undefined)}
          save={async (raw) => {
            const b = raw as EditorBody,
              {
                hours: values,
                submit,
                idempotencyKey,
              } = b.values as { hours: unknown; submit: boolean; idempotencyKey: string }
            await persist(hours ? `/weeks/${hours.id}` : '/weeks', hours ? 'PATCH' : 'POST', {
              values,
              submit,
              idempotencyKey,
              revision: b.revision,
              reason: b.reason,
            })
          }}
        />
      )}
      {upload && (
        <PaystubUpload
          home={home}
          week={upload}
          close={() => setUpload(undefined)}
          extracted={(p) => {
            setUpload(undefined)
            setReview({ week: { ...upload, revision: p.revision }, preview: p })
          }}
        />
      )}
      {review && (
        <PayrollReviewForm
          week={review.week}
          initial={review.preview.statement}
          warnings={review.preview.warnings}
          close={() => {
            setReview(undefined)
            void refresh()
          }}
          save={async (raw) => {
            const b = raw as EditorBody
            await persist(`/weeks/${review.week.id}/review`, 'POST', {
              revision: b.revision,
              reason: b.reason,
              statement: b.values,
              documentDigest: review.preview.documentDigest,
            })
            changed()
          }}
        />
      )}
      {deposit && (
        <FinancialEditor
          title="Correct payroll deposit"
          reasonLabel="Deposit confirmation / correction note"
          record={deposit}
          close={() => setDeposit(undefined)}
          build={(f) => ({
            date: f.get('depositDate'),
            amountCents: bankDecimalCents(String(f.get('receivedNet'))),
            reference: String(f.get('reference') || '') || null,
          })}
          submitLabel="Save correction"
          save={async (raw) => {
            const b = raw as EditorBody,
              v = b.values as { date: string; reference: string | null; amountCents: number },
              transaction = transactions.find((t) => t.id === deposit.incomeTransactionId)
            if (!transaction) throw new Error('Refresh Income before confirming this deposit')
            const values = incomeTransactionSchema.strip().parse({
              ...transaction,
              status: 'confirmed',
              depositDate: v.date,
              receiptConfirmed: true,
              reference: v.reference,
              actualNetCents: v.amountCents,
            })
            await apiRequest(`households/${home}/income/transactions/${transaction.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ revision: transaction.revision, reason: b.reason, values }),
            })
            await refresh()
            notify('success', 'Actual payroll deposit confirmed')
            changed()
          }}
        >
          <p className="text-sm">
            Confirm the documented net deposit of{' '}
            <strong>{formatMoney(deposit.statement?.netCents ?? null)}</strong> actually arrived.
            This is not payment processing.
          </p>
          <DateField
            label="Actual deposit date"
            name="depositDate"
            value={
              transactions.find((t) => t.id === deposit.incomeTransactionId)?.depositDate ??
              deposit.statement?.payDate
            }
            required
          />
          <AmountField
            label="Actual net amount received ($)"
            name="receivedNet"
            value={
              transactions.find((t) => t.id === deposit.incomeTransactionId)?.actualNetCents ??
              deposit.statement?.netCents
            }
            required
          />
          <FormField label="Reference (optional)">
            <Input
              placeholder="Confirmation or reference number"
              name="reference"
              maxLength={160}
            />
          </FormField>
        </FinancialEditor>
      )}
    </section>
  )
}
