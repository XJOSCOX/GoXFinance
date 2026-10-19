import { useState, type FormEvent } from 'react'
import { accountStatusLabels, debtTypeLabels, paymentStatusLabels, type Debt, type DebtInput, type HouseholdMember } from '@goxfinance/shared'
import { Button, Input } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { errorMessage } from '../../../lib/api'

const moneyFields = ['originalBalanceCents', 'currentBalanceCents', 'pastDueAmountCents', 'creditLimitCents', 'minimumPaymentCents'] as const
type MoneyField = typeof moneyFields[number]
const moneyLabels: Record<MoneyField, string> = { originalBalanceCents: 'Original balance', currentBalanceCents: 'Current balance',
  pastDueAmountCents: 'Past due', creditLimitCents: 'Credit limit', minimumPaymentCents: 'Minimum payment' }
const moneyText = (cents: number | null | undefined) => cents == null ? '' : (cents / 100).toFixed(2)
const fromMoneyText = (value: string) => value.trim() === '' ? null : Math.round(Number(value) * 100)
const initial = (debt?: Debt | null): DebtInput => ({
  creditorName: debt?.creditorName ?? '', accountNickname: debt?.accountNickname ?? null,
  accountType: debt?.accountType ?? 'credit_card', accountStatus: debt?.accountStatus ?? 'unknown',
  paymentStatus: debt?.paymentStatus ?? 'unknown', originalBalanceCents: debt?.originalBalanceCents ?? null,
  currentBalanceCents: debt?.currentBalanceCents ?? null, pastDueAmountCents: debt?.pastDueAmountCents ?? null,
  creditLimitCents: debt?.creditLimitCents ?? null, minimumPaymentCents: debt?.minimumPaymentCents ?? null,
  interestRateApr: debt?.interestRateApr ?? null, dueDay: debt?.dueDay ?? null,
  nextDueDate: debt?.nextDueDate ?? null, lastPaymentDate: debt?.lastPaymentDate ?? null,
  openedDate: debt?.openedDate ?? null, closedDate: debt?.closedDate ?? null, chargedOffDate: debt?.chargedOffDate ?? null,
  collectionAgency: debt?.collectionAgency ?? null, originalCreditor: debt?.originalCreditor ?? null,
  linkedOriginalDebtId: debt?.linkedOriginalDebtId ?? null, duplicateLinkVerified: debt?.duplicateLinkVerified ?? false,
  balanceVerifiedAt: debt?.balanceVerifiedAt ?? null, confidence: debt?.confidence ?? 'unverified', notes: debt?.notes ?? null,
  memberAssignments: debt?.memberAssignments ?? [],
})

export function DebtFormDialog({ debt, members, debts, role, currentMemberId, onClose, onSave }: {
  debt?: Debt | null; members: HouseholdMember[]; debts: Debt[]; role: string; currentMemberId?: string;
  onClose: () => void; onSave: (input: DebtInput) => Promise<void>
}) {
  const [form, setForm] = useState<DebtInput>(() => initial(debt))
  const [money, setMoney] = useState<Record<MoneyField, string>>(() => Object.fromEntries(moneyFields.map(field => [field, moneyText(debt?.[field])])) as Record<MoneyField, string>)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof DebtInput>(key: K, value: DebtInput[K]) => setForm(current => ({ ...current, [key]: value }))
  const label = 'mb-1 block text-xs font-medium text-slate-400'
  const select = 'h-10 w-full rounded-lg border border-white/10 bg-[#151716] px-3 text-sm text-white'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    const parsedMoney = Object.fromEntries(moneyFields.map(field => [field, fromMoneyText(money[field])]))
    if (Object.values(parsedMoney).some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) {
      setError('Enter valid nonnegative amounts with at most two decimal places'); return
    }
    if (Object.values(money).some(value => value && !/^\d+(?:\.\d{1,2})?$/.test(value))) {
      setError('Use at most two decimal places for amounts'); return
    }
    if (!form.memberAssignments?.length) { setError('Assign at least one household member'); return }
    setBusy(true)
    try { await onSave({ ...form, ...parsedMoney }); onClose() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <Modal title={debt ? 'Edit debt' : 'Add debt'} onClose={onClose}><form onSubmit={event => void submit(event)} className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className={label}>Creditor *</span><Input required maxLength={160} value={form.creditorName} onChange={event => set('creditorName', event.target.value)} /></label>
      <label><span className={label}>Nickname</span><Input value={form.accountNickname ?? ''} onChange={event => set('accountNickname', event.target.value || null)} /></label>
      <label><span className={label}>Type</span><select className={select} value={form.accountType} onChange={event => set('accountType', event.target.value as DebtInput['accountType'])}>{Object.entries(debtTypeLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      {moneyFields.map(field => <label key={field}><span className={label}>{moneyLabels[field]} ($)</span><Input inputMode="decimal" value={money[field]} onChange={event => setMoney(current => ({ ...current, [field]: event.target.value }))} placeholder="Unknown" /></label>)}
      <label><span className={label}>APR (%)</span><Input inputMode="decimal" value={form.interestRateApr ?? ''} onChange={event => set('interestRateApr', event.target.value || null)} /></label>
      <label><span className={label}>Due day (1–31)</span><Input type="number" min={1} max={31} value={form.dueDay ?? ''} onChange={event => set('dueDay', event.target.value ? Number(event.target.value) : null)} /></label>
      <label><span className={label}>Account status</span><select className={select} value={form.accountStatus} onChange={event => set('accountStatus', event.target.value as DebtInput['accountStatus'])}>{Object.entries(accountStatusLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label><span className={label}>Payment status</span><select className={select} value={form.paymentStatus} onChange={event => set('paymentStatus', event.target.value as DebtInput['paymentStatus'])}>{Object.entries(paymentStatusLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label><span className={label}>Confidence</span><select className={select} value={form.confidence} onChange={event => set('confidence', event.target.value as DebtInput['confidence'])}><option value="confirmed">Confirmed</option><option value="estimated">Estimated</option><option value="unverified">Unverified</option></select></label>
      <label><span className={label}>Balance verified on</span><Input type="date" value={form.balanceVerifiedAt?.slice(0, 10) ?? ''} onChange={event => set('balanceVerifiedAt', event.target.value ? `${event.target.value}T00:00:00.000Z` : null)} /></label>
      {(['nextDueDate', 'lastPaymentDate', 'openedDate', 'closedDate', 'chargedOffDate'] as const).map(field => <label key={field}><span className={label}>{field.replace(/([A-Z])/g, ' $1')}</span><Input type="date" value={form[field] ?? ''} onChange={event => set(field, event.target.value || null)} /></label>)}
    </div>
    <fieldset className="border-t border-white/10 pt-4"><legend className="text-sm font-semibold">Responsible members *</legend><div className="mt-2 space-y-2">{members.filter(member => member.status === 'active' && (role !== 'editor' || member.id === currentMemberId) && (role === 'owner' || member.accessRole !== 'owner')).map(member => {
      const assignment = form.memberAssignments?.find(item => item.memberId === member.id)
      return <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(assignment)} disabled={Boolean(debt) && role !== 'owner'} onChange={event => set('memberAssignments', event.target.checked ? [...(form.memberAssignments ?? []), { memberId: member.id, responsibility: 'primary' }] : (form.memberAssignments ?? []).filter(item => item.memberId !== member.id))}/>{member.fullName}</label>{assignment && <select aria-label={`${member.fullName} responsibility`} className={select + ' w-auto'} value={assignment.responsibility} disabled={Boolean(debt) && role !== 'owner'} onChange={event => set('memberAssignments', (form.memberAssignments ?? []).map(item => item.memberId === member.id ? { ...item, responsibility: event.target.value as typeof item.responsibility } : item))}><option value="primary">Primary</option><option value="joint">Joint</option><option value="authorized_user">Authorized user</option><option value="other">Other</option></select>}</div>
    })}</div></fieldset>
    <div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2"><label><span className={label}>Collection agency</span><Input value={form.collectionAgency ?? ''} onChange={event => set('collectionAgency', event.target.value || null)}/></label><label><span className={label}>Original creditor</span><Input value={form.originalCreditor ?? ''} onChange={event => set('originalCreditor', event.target.value || null)}/></label>
      <label className="sm:col-span-2"><span className={label}>Linked original account</span><select className={select} value={form.linkedOriginalDebtId ?? ''} onChange={event => set('linkedOriginalDebtId', event.target.value || null)}><option value="">None</option>{debts.filter(item => !item.isArchived && item.id !== debt?.id).map(item => <option key={item.id} value={item.id}>{item.creditorName}{item.accountNickname ? ` · ${item.accountNickname}` : ''}</option>)}</select></label>
      <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.duplicateLinkVerified ?? false} onChange={event => set('duplicateLinkVerified', event.target.checked)}/>Verify these records represent the same obligation</label>
    </div>
    <label className="block"><span className={label}>Notes</span><textarea className={select + ' h-24 py-2'} maxLength={4000} value={form.notes ?? ''} onChange={event => set('notes', event.target.value || null)}/></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save debt'}</Button></div>
  </form></Modal>
}
