import { useState } from 'react'
import {
  localBillDate,
  type Insight,
  type InsightsData,
  type InsightPlan,
} from '@goxfinance/shared'
import { Modal } from '../../components/ui/Modal'
import { FormField } from '../../components/ui/FormField'
import { Button, Input } from '../../components/ui'
import { apiRequest, errorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/money'
export function InsightPlanModal({
  home,
  data,
  insight,
  onClose,
  onSaved,
}: {
  home: string
  data: InsightsData
  insight: Insight
  onClose: () => void
  onSaved: () => void
}) {
  const today = localBillDate(),
    [endDate, setEnd] = useState(
      new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10),
    ),
    [amount, setAmount] = useState(''),
    [notes, setNotes] = useState(''),
    [scenario, setScenario] = useState<InsightPlan['scenario'] | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key] = useState(() => crypto.randomUUID()),
    [acceptedFingerprint] = useState(data.fingerprint)
  const reduction =
    amount === ''
      ? null
      : /^\d+(?:\.\d{1,2})?$/.test(amount)
        ? Number(
            BigInt(amount.split('.')[0]) * 100n +
              BigInt((amount.split('.')[1] ?? '').padEnd(2, '0')),
          )
        : NaN
  const body = () => ({
    idempotencyKey: key,
    fingerprint: acceptedFingerprint,
    revision: 0,
    values: {
      kind: 'plan',
      insightId: insight.id,
      status: 'planned',
      startDate: today,
      endDate,
      reductionCents: reduction,
      notes,
    },
  })
  async function submit(preview: boolean) {
    setBusy(true)
    setError('')
    try {
      if (reduction !== null && (!Number.isSafeInteger(reduction) || reduction <= 0))
        throw new Error('Enter a positive USD amount with at most two decimal places.')
      if (!preview && reduction !== null && scenario === undefined)
        throw new Error('Preview the current scenario before accepting this reduction.')
      const result = await apiRequest<{ scenario: InsightPlan['scenario'] }>(
        `households/${home}/insights/${preview ? 'preview' : 'actions'}`,
        { method: 'POST', body: JSON.stringify(body()) },
      )
      if (preview) setScenario(result.scenario)
      else {
        onSaved()
        onClose()
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Create action plan" onClose={onClose} className="max-w-xl">
      <p className="mb-4 text-sm text-slate-400">{insight.title}</p>
      <div className="space-y-4">
        <FormField label="Review through">
          <Input
            type="date"
            min={today}
            value={endDate}
            onChange={(e) => {
              setEnd(e.target.value)
              setScenario(undefined)
            }}
          />
        </FormField>
        {insight.reducibleCents !== undefined && (
          <FormField label="Optional spending reduction (USD)">
            <Input
              inputMode="decimal"
              placeholder={`Up to ${(insight.reducibleCents / 100).toFixed(2)}; blank for review only`}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setScenario(undefined)
              }}
            />
          </FormField>
        )}
        <FormField label="Your next step">
          <textarea
            className="min-h-20 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm"
            maxLength={1000}
            placeholder="Details or a reminder; no payment will be made"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        {reduction !== null && (
          <p className="text-xs text-slate-400">
            Baseline adds the full remaining category allowance to the existing forecast; proposed
            reduces that allowance. This scenario does not edit your saved budget or duplicate
            category bills.
          </p>
        )}
        {scenario !== undefined && scenario && (
          <div role="status" className="rounded-lg border border-sky-300/20 p-3 text-sm">
            <p>
              Minimum cash: {formatMoney(scenario.baseline.lowestCents)} →{' '}
              {formatMoney(scenario.proposed.lowestCents)}
            </p>
            <p className="mt-1">Potential improvement: {formatMoney(scenario.improvementCents)}</p>
            {(scenario.baseline.incomplete || scenario.proposed.incomplete) && (
              <p className="mt-2 text-xs text-amber-200">
                Incomplete forecast. No reliable cash impact can be claimed.
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Accepting or completing this plan does not record spending, savings or a payment.
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {reduction !== null && (
            <Button variant="secondary" disabled={busy} onClick={() => void submit(true)}>
              Preview scenario
            </Button>
          )}
          <Button
            disabled={busy || (reduction !== null && scenario === undefined)}
            onClick={() => void submit(false)}
          >
            {busy ? 'Working…' : 'Accept plan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
