import { plannerLocalTimestamp } from '@goxfinance/shared'
import type { BankAccount, ForecastEvent } from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { readMoney, text } from '../../../lib/financial-entry'
import { apiRequest } from '../../../lib/api'
import { formatMoney } from '../../../lib/money'
export function AvailableBalanceForm({
  home,
  accounts,
  initialAccount,
  events = [],
  close,
  saved,
}: {
  home: string
  accounts: BankAccount[]
  initialAccount?: string
  events?: ForecastEvent[]
  close: () => void
  saved: () => void
}) {
  return (
    <FinancialEditor
      title="Update available balance"
      close={close}
      submitLabel="Save balance observation"
      save={async (body) => {
        const p = body as { values: object; idempotencyKey: string }
        await apiRequest(`households/${home}/planner/balances`, {
          method: 'POST',
          body: JSON.stringify({ ...p.values, idempotencyKey: p.idempotencyKey }),
        })
        saved()
      }}
      build={(f) => ({
        accountId: text(f, 'accountId'),
        availableCents: readMoney(f, 'amount', true),
        effectiveAt: plannerLocalTimestamp(text(f, 'effectiveAt'), text(f, 'timezone')),
        timezone: text(f, 'timezone'),
        source: text(f, 'source'),
        pendingIncluded: text(f, 'pendingIncluded'),
        includedPending: f.getAll('hold').map((id) => {
          const event = events.find((e) => e.id === id)!
          return { eventId: event.id, amountCents: event.amountCents }
        }),
        notes: text(f, 'notes'),
        proof: text(f, 'proof'),
      })}
    >
      <p className="text-sm text-slate-400">
        A dated observation, separate from income or spending. After saving, confirm which account
        balances form your opening cash.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Cash account">
          <Select name="accountId" defaultValue={initialAccount ?? ''} required>
            <option value="">Select account</option>
            {accounts
              .filter(
                (a) => a.type !== 'credit_card' && a.currency === 'USD' && a.status === 'active',
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </FormField>
        <AmountField name="amount" label="Available balance (USD)" required />
        <FormField label="Balance effective time (selected zone)">
          <Input
            name="effectiveAt"
            type="datetime-local"
            defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16)}
            required
          />
        </FormField>
        <FormField label="Time zone">
          <Input
            name="timezone"
            required
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            placeholder="America/Chicago"
          />
        </FormField>
        <FormField label="Balance source">
          <Select name="source" defaultValue="user_reported">
            <option value="user_reported">User reported</option>
            <option value="reconciled">Reconciled against records</option>
          </Select>
        </FormField>
        <FormField label="Are pending debits already included?">
          <Select name="pendingIncluded" defaultValue="unknown">
            <option value="unknown">Not sure — verify before relying on cash</option>
            <option value="yes">Yes — identify the included holds below</option>
            <option value="no">No — apply future debits separately</option>
          </Select>
        </FormField>
      </div>
      {events.some((e) => e.kind === 'pending' && e.direction === 'out') && (
        <fieldset className="space-y-2 rounded-lg border border-white/10 p-3">
          <legend className="px-2 text-sm">Pending holds included in this balance</legend>
          {events
            .filter((e) => e.kind === 'pending' && e.direction === 'out' && e.amountCents !== null)
            .map((e) => (
              <label key={e.id} className="flex gap-2 text-sm">
                <input name="hold" type="checkbox" value={e.id} />
                {e.name} · {formatMoney(e.amountCents)}
              </label>
            ))}
        </fieldset>
      )}
      <FormField label="Reconciliation evidence (if reconciled)">
        <Input name="proof" placeholder="Statement or reconciliation reference" maxLength={1000} />
      </FormField>
      <FormField label="Notes (optional)">
        <Input
          name="notes"
          placeholder="Balance details or pending items to verify"
          maxLength={500}
        />
      </FormField>
      <p className="text-xs text-slate-400">
        User reports are not verified live-bank balances. Credit limits, investment values and
        nominal trading balances are excluded.
      </p>
    </FinancialEditor>
  )
}
