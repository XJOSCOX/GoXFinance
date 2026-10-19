import { CategoryPicker } from '../../categories/components/CategoryPicker'
import { moneyText, parseMoney } from '../../../lib/payment-money'
import { useState, type FormEvent } from 'react'
import {
  accountStatusLabels,
  debtTypeLabels,
  paymentStatusLabels,
  type Debt,
  type DebtInput,
  type HouseholdMember,
} from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'
import { DebtFormSection } from './DebtFormSection'
import { DebtMemberFields } from './DebtMemberFields'

const dateFields = [
  ['nextDueDate', 'Next due date'],
  ['lastPaymentDate', 'Last payment date'],
  ['openedDate', 'Opened date'],
  ['closedDate', 'Closed date'],
  ['chargedOffDate', 'Charged-off date'],
] as const

const moneyFields = [
  'originalBalanceCents',
  'currentBalanceCents',
  'pastDueAmountCents',
  'creditLimitCents',
  'minimumPaymentCents',
] as const
type MoneyField = (typeof moneyFields)[number]
const moneyLabels: Record<MoneyField, string> = {
  originalBalanceCents: 'Original balance',
  currentBalanceCents: 'Current balance',
  pastDueAmountCents: 'Past due',
  creditLimitCents: 'Credit limit',
  minimumPaymentCents: 'Minimum payment',
}
const initial = (debt?: Debt | null): DebtInput => ({
  creditorName: debt?.creditorName ?? '',
  categoryId: debt?.categoryId ?? null,
  accountNickname: debt?.accountNickname ?? null,
  accountType: debt?.accountType ?? 'credit_card',
  accountStatus: debt?.accountStatus ?? 'unknown',
  paymentStatus: debt?.paymentStatus ?? 'unknown',
  originalBalanceCents: debt?.originalBalanceCents ?? null,
  currentBalanceCents: debt?.currentBalanceCents ?? null,
  pastDueAmountCents: debt?.pastDueAmountCents ?? null,
  creditLimitCents: debt?.creditLimitCents ?? null,
  minimumPaymentCents: debt?.minimumPaymentCents ?? null,
  interestRateApr: debt?.interestRateApr ?? null,
  dueDay: debt?.dueDay ?? null,
  nextDueDate: debt?.nextDueDate ?? null,
  lastPaymentDate: debt?.lastPaymentDate ?? null,
  openedDate: debt?.openedDate ?? null,
  closedDate: debt?.closedDate ?? null,
  chargedOffDate: debt?.chargedOffDate ?? null,
  collectionAgency: debt?.collectionAgency ?? null,
  originalCreditor: debt?.originalCreditor ?? null,
  linkedOriginalDebtId: debt?.linkedOriginalDebtId ?? null,
  duplicateLinkVerified: debt?.duplicateLinkVerified ?? false,
  balanceVerifiedAt: debt?.balanceVerifiedAt ?? null,
  confidence: debt?.confidence ?? 'unverified',
  notes: debt?.notes ?? null,
  memberAssignments: debt?.memberAssignments ?? [],
})

export function DebtFormDialog({
  debt,
  members,
  debts,
  role,
  currentMemberId,
  onClose,
  onSave,
  requestMode = false,
}: {
  debt?: Debt | null
  members: HouseholdMember[]
  debts: Debt[]
  role: string
  currentMemberId?: string
  onClose: () => void
  onSave: (input: DebtInput, reason?: string, requestKey?: string) => Promise<void>
  requestMode?: boolean
}) {
  const [form, setForm] = useState<DebtInput>(() => initial(debt))
  const [money, setMoney] = useState<Record<MoneyField, string>>(
    () =>
      Object.fromEntries(moneyFields.map((field) => [field, moneyText(debt?.[field])])) as Record<
        MoneyField,
        string
      >,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [requestKey] = useState(() => crypto.randomUUID())
  const set = <K extends keyof DebtInput>(key: K, value: DebtInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const label = 'mb-1 block text-xs font-medium text-slate-400'
  const select =
    'h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-sm text-white'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    let parsedMoney: Record<MoneyField, number | null>
    try {
      parsedMoney = Object.fromEntries(
        moneyFields.map((field) => [field, parseMoney(money[field])]),
      ) as Record<MoneyField, number | null>
    } catch (failure) {
      setError(errorMessage(failure))
      return
    }
    if (!form.memberAssignments?.length) {
      setError('Assign at least one household member')
      return
    }
    setBusy(true)
    try {
      await onSave({ ...form, ...parsedMoney }, reason.trim(), requestKey)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  function amountField(field: MoneyField) {
    return (
      <label>
        <span className={label}>{moneyLabels[field]} ($)</span>
        <Input
          inputMode="decimal"
          value={money[field]}
          disabled={Boolean(debt) && field === 'currentBalanceCents'}
          onChange={(event) => setMoney((current) => ({ ...current, [field]: event.target.value }))}
          placeholder="Unknown"
          className="tabular-nums"
        />
      </label>
    )
  }
  return (
    <Modal
      title={requestMode ? 'Request account changes' : debt ? 'Edit debt' : 'Add debt'}
      onClose={onClose}
      framed
      className="max-w-2xl"
    >
      <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
          <p className="mb-6 text-sm leading-5 text-slate-400">
            {requestMode
              ? 'Propose changes for the household Owner to review.'
              : 'Start with the account and who is responsible. Add other details when you have them.'}
          </p>
          <section aria-label="Account details" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
              <label>
                <span className={label}>Creditor *</span>
                <Input
                  required
                  maxLength={160}
                  placeholder="Bank or lender name"
                  value={form.creditorName}
                  onChange={(event) => set('creditorName', event.target.value)}
                />
              </label>
              <label>
                <span className={label}>Type</span>
                <select
                  className={select}
                  value={form.accountType}
                  onChange={(event) =>
                    set('accountType', event.target.value as DebtInput['accountType'])
                  }
                >
                  {Object.entries(debtTypeLabels).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <CategoryPicker
              home={members[0]?.householdId ?? ''}
              value={form.categoryId}
              optional
              onChange={(id) => set('categoryId', id)}
            />
            <label className="block">
              <span className={label}>Nickname</span>
              <Input
                placeholder="Optional account label"
                value={form.accountNickname ?? ''}
                onChange={(event) => set('accountNickname', event.target.value || null)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              {amountField('currentBalanceCents')}
              {amountField('minimumPaymentCents')}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {debt
                ? 'Change the current balance in Balance History to keep a record of each update.'
                : 'Leave unavailable amounts blank. A balance is the amount owed; a minimum is a monthly payment.'}
            </p>
          </section>
          <DebtMemberFields
            form={form}
            set={set}
            members={members}
            role={role}
            currentMemberId={currentMemberId}
            editing={Boolean(debt)}
            requestMode={requestMode}
          />
          {requestMode && (
            <div className="mt-5">
              <label className="block">
                <span className={label}>Reason for Owner approval *</span>
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={select + ' h-20 py-2'}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Nothing changes until the Owner approves.
              </p>
            </div>
          )}
          <div className="mt-6 space-y-2 border-t border-white/[.08] pt-5">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[.16em] text-slate-500">
              Additional details · optional
            </p>
            <DebtFormSection
              title="Balances & status"
              description="Limits, interest and account standing"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {amountField('originalBalanceCents')}
                {amountField('pastDueAmountCents')}
                {amountField('creditLimitCents')}
                <label>
                  <span className={label}>APR (%)</span>
                  <Input
                    inputMode="decimal"
                    placeholder="Unknown"
                    value={form.interestRateApr ?? ''}
                    onChange={(event) => set('interestRateApr', event.target.value || null)}
                  />
                </label>
                <label>
                  <span className={label}>Account status</span>
                  <select
                    className={select}
                    value={form.accountStatus}
                    onChange={(event) =>
                      set('accountStatus', event.target.value as DebtInput['accountStatus'])
                    }
                  >
                    {Object.entries(accountStatusLabels).map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Payment status</span>
                  <select
                    className={select}
                    value={form.paymentStatus}
                    onChange={(event) =>
                      set('paymentStatus', event.target.value as DebtInput['paymentStatus'])
                    }
                  >
                    {Object.entries(paymentStatusLabels).map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Confidence</span>
                  <select
                    className={select}
                    value={form.confidence}
                    onChange={(event) =>
                      set('confidence', event.target.value as DebtInput['confidence'])
                    }
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="estimated">Estimated</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </label>
              </div>
            </DebtFormSection>
            <DebtFormSection
              title="Dates & payment schedule"
              description="Due dates and account history"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={label}>Due day (1–31)</span>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Unknown"
                    value={form.dueDay ?? ''}
                    onChange={(event) =>
                      set('dueDay', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                </label>
                <label>
                  <span className={label}>Balance verified on</span>
                  <Input
                    type="date"
                    style={{ colorScheme: 'dark' }}
                    disabled={Boolean(debt)}
                    value={form.balanceVerifiedAt?.slice(0, 10) ?? ''}
                    onChange={(event) =>
                      set(
                        'balanceVerifiedAt',
                        event.target.value ? event.target.value + 'T00:00:00.000Z' : null,
                      )
                    }
                  />
                </label>
                {dateFields.map(([field, name]) => (
                  <label key={field}>
                    <span className={label}>{name}</span>
                    <Input
                      type="date"
                      style={{ colorScheme: 'dark' }}
                      value={form[field] ?? ''}
                      onChange={(event) => set(field, event.target.value || null)}
                    />
                  </label>
                ))}
              </div>
            </DebtFormSection>
            <DebtFormSection
              title="Collections & linked accounts"
              description="Agency details and duplicate records"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={label}>Collection agency</span>
                  <Input
                    value={form.collectionAgency ?? ''}
                    onChange={(event) => set('collectionAgency', event.target.value || null)}
                  />
                </label>
                <label>
                  <span className={label}>Original creditor</span>
                  <Input
                    value={form.originalCreditor ?? ''}
                    onChange={(event) => set('originalCreditor', event.target.value || null)}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={label}>Linked original account</span>
                  <select
                    className={select}
                    value={form.linkedOriginalDebtId ?? ''}
                    onChange={(event) => set('linkedOriginalDebtId', event.target.value || null)}
                  >
                    <option value="">None</option>
                    {debts
                      .filter((item) => !item.isArchived && item.id !== debt?.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.creditorName}
                          {item.accountNickname ? ' · ' + item.accountNickname : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="sm:col-span-2 flex items-start gap-2 text-xs leading-5 text-slate-400">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#b1beb0]"
                    checked={form.duplicateLinkVerified ?? false}
                    onChange={(event) => set('duplicateLinkVerified', event.target.checked)}
                  />
                  Verify these records represent the same obligation
                </label>
              </div>
            </DebtFormSection>
            <DebtFormSection title="Notes" description="Anything else to keep with this account">
              <label className="block">
                <span className={label}>Notes</span>
                <textarea
                  className={select + ' h-24 py-2'}
                  maxLength={4000}
                  value={form.notes ?? ''}
                  onChange={(event) => set('notes', event.target.value || null)}
                />
              </label>
            </DebtFormSection>
          </div>
        </div>
        <footer className="shrink-0 border-t border-white/[.08] bg-[#1b1d1c] px-5 py-4 sm:px-7">
          {error && (
            <p role="alert" className="mb-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">* Required</span>
            <div className="flex gap-2">
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : requestMode ? 'Request approval' : 'Save debt'}
              </Button>
            </div>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
