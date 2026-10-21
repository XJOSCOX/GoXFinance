import { useRef, useState } from 'react'
import {
  availableCashAccounts,
  selectedOpeningTotal,
  type ForecastData,
  type ForecastPreferences,
  type OpeningCash,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { Modal } from '../../../components/ui/Modal'
import { apiRequest, errorMessage } from '../../../lib/api'
import { moneyText, readMoney, text } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'

function localTimestamp() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
function timestamp(value: string) {
  const date = new Date(value),
    minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  return `${value}:00${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`
}
export function OpeningCashForm({
  home,
  data,
  close,
  saved,
}: {
  home: string
  data: ForecastData
  close: () => void
  saved: () => void
}) {
  const [source, setSource] = useState<'user_confirmed' | 'selected_accounts' | 'keep_existing'>(
    'user_confirmed',
  )
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const accounts = availableCashAccounts(data.sources, new Date().toISOString())
  return (
    <Modal title="Opening cash & safety buffer" onClose={close} framed className="max-w-xl">
      <form
        className="dialog-scroll min-h-0 overflow-y-auto p-5 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          const form = new FormData(e.currentTarget)
          setBusy(true)
          setError('')
          try {
            const date = text(form, 'effectiveAt')
            const balances = accounts
              .filter((a) => selected.includes(a.id))
              .map((a) => ({
                accountId: a.id,
                balanceId: a.balance!.id,
                availableCents: a.balance!.availableCents!,
              }))
            const opening: OpeningCash | null =
              source === 'keep_existing'
                ? (data.settings?.opening ?? null)
                : form.has('clear')
                  ? null
                  : {
                      source,
                      amountCents:
                        source === 'user_confirmed'
                          ? readMoney(form, 'amount', true)!
                          : selectedOpeningTotal(balances),
                      effectiveAt: timestamp(date),
                      effectiveDate: date.slice(0, 10),
                      confidence: 'confirmed',
                      confirmed: true,
                      accounts: source === 'selected_accounts' ? balances : [],
                      includedActivityIds: [],
                    }
            const values: ForecastPreferences = {
              opening,
              bufferCents: readMoney(form, 'buffer', true)!,
            }
            if (values.bufferCents < 0) throw new Error('Safety buffer must be zero or greater.')
            await apiRequest(`households/${home}/forecasts/preferences`, {
              method: 'PUT',
              body: JSON.stringify({
                values,
                revision: data.settings?.revision ?? 0,
                fingerprint: data.fingerprint,
                reason: text(form, 'reason'),
                idempotencyKey: key.current,
                includeRecordedSameDayActivity: form.has('included'),
                keepOpening: source === 'keep_existing',
              }),
            })
            saved()
          } catch (failure) {
            setError(errorMessage(failure))
          } finally {
            setBusy(false)
          }
        }}
        onChange={() => {
          key.current = crypto.randomUUID()
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Confirm spendable cash, not income, net worth or borrowing capacity. Bank balances are
            manually recorded; this is not a live bank connection.
          </p>
          <FormField label="Opening cash source">
            <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="user_confirmed">I confirm available cash</option>
              {data.settings && (
                <option value="keep_existing">Keep cash confirmation; update buffer only</option>
              )}
              <option value="selected_accounts">Selected current manual account balances</option>
            </Select>
          </FormField>
          {source === 'user_confirmed' ? (
            <FormField label="Available cash (USD)">
              <Input
                name="amount"
                inputMode="decimal"
                required
                defaultValue={moneyText(data.settings?.opening?.amountCents)}
                placeholder="Available cash in USD, including a negative balance"
              />
            </FormField>
          ) : source === 'keep_existing' ? (
            <p className="text-sm text-slate-400">
              Keep the existing cash confirmation and timing, including any private account
              selection.
            </p>
          ) : (
            <fieldset className="space-y-2 rounded-xl border border-white/10 p-3">
              <legend className="px-1 text-sm">Choose nonoverlapping accounts</legend>
              {!accounts.length && (
                <p className="text-xs text-slate-400">
                  No eligible manual USD available balances recorded in the last 24 hours. Confirm
                  cash manually instead. Cached Plaid balances and credit cards are excluded.
                </p>
              )}
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, a.id]
                          : selected.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.name} · {formatMoney(a.balance!.availableCents)}
                </label>
              ))}
              <p className="text-sm">
                Selected available cash:{' '}
                {formatMoney(
                  selectedOpeningTotal(
                    accounts
                      .filter((a) => selected.includes(a.id))
                      .map((a) => ({ availableCents: a.balance!.availableCents! })),
                  ),
                )}
              </p>
            </fieldset>
          )}
          {source !== 'keep_existing' && (
            <>
              <FormField label="Effective local date and time">
                <Input
                  type="datetime-local"
                  name="effectiveAt"
                  required
                  defaultValue={localTimestamp()}
                  max={localTimestamp()}
                />
              </FormField>
              <label className="flex items-start gap-2 text-xs text-slate-300">
                <input type="checkbox" name="included" className="mt-0.5" />
                This cash already includes all currently recorded cash activity on the effective
                date. Exclude that activity from the projection.
              </label>
              <p className="text-xs text-slate-500">
                Date-only transactions on this date have uncertain timing unless included
                explicitly. Later activity with uncertain timing will flag the projection
                incomplete.
              </p>
            </>
          )}
          <FormField label="Household safety buffer (USD)">
            <Input
              name="buffer"
              inputMode="decimal"
              required
              defaultValue={moneyText(data.settings?.bufferCents ?? 0)}
              list="cash-buffers"
              placeholder="0, 250, 500, 1000 or your amount"
            />
          </FormField>
          <datalist id="cash-buffers">
            {['0', '250', '500', '1000'].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <FormField label="Confirmation note">
            <Input
              name="reason"
              required
              maxLength={2000}
              placeholder="How you checked available cash"
            />
          </FormField>
          {data.settings?.opening && source !== 'keep_existing' && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" name="clear" />
              Clear the opening balance; keep the buffer preference
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1" />
            {source === 'keep_existing'
              ? 'I reviewed the planning settings.'
              : 'I reviewed the cash amount, timing and selected accounts.'}
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <footer className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
          <Button type="button" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? 'Confirming…' : 'Confirm cash & buffer'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
