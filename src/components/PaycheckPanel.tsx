import { useState } from 'react'
import { Card, Button, Input, Select } from './ui'
import { estimatedGross, confirmationState, incomeHistory, localDate } from '../lib/paychecks'
import { incomeTransactionSchema, newBase, type Backup } from '../lib/schema'
import { usd } from '../lib/utils'

type Paycheck = Backup['incomeTransactions'][number]
const localToday = localDate

export function PaycheckPanel({ data, onSave }: { data: Backup; onSave: (record: Paycheck) => Promise<void> }) {
  const sources = data.incomes.filter(source => source.payType === 'hourly' || source.payType === 'variable')
  const [sourceId, setSourceId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('Paycheck')
  const [workPeriodStart, setWorkPeriodStart] = useState('')
  const [workPeriodEnd, setWorkPeriodEnd] = useState('')
  const [regularHours, setRegularHours] = useState('')
  const [overtimeHours, setOvertimeHours] = useState('')
  const [overtimeMultiplier, setOvertimeMultiplier] = useState('1.5')
  const [actualGross, setActualGross] = useState('')
  const [deductions, setDeductions] = useState('')
  const [net, setNet] = useState('')
  const [confirmationDate, setConfirmationDate] = useState(localToday())
  const [depositDate, setDepositDate] = useState(localToday())
  const [bankAccountId, setBankAccountId] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const selected = sources.find(source => source.id === sourceId)
  const old = data.incomeTransactions.find(row => row.id === editingId)
  const rate = old?.hourlyRateSnapshot ?? selected?.hourlyRate ?? null
  const hours = (value: string) => value === '' ? null : Number(value)
  const grossEstimate = estimatedGross(rate, hours(regularHours), hours(overtimeHours), Number(overtimeMultiplier))
  const history = incomeHistory(data.incomeTransactions)
  const state = selected ? confirmationState(selected, data.incomeTransactions, localToday()) : null

  function edit(row: Paycheck) {
    setEditingId(row.id); setSourceId(row.sourceId ?? ''); setName(row.name)
    setWorkPeriodStart(row.workPeriodStart ?? ''); setWorkPeriodEnd(row.workPeriodEnd ?? '')
    setRegularHours(row.regularHours?.toString() ?? ''); setOvertimeHours(row.overtimeHours?.toString() ?? '')
    setOvertimeMultiplier(String(row.overtimeMultiplier)); setActualGross(row.gross?.toString() ?? '')
    setDeductions(row.deductions?.toString() ?? ''); setNet(String(row.amount))
    setConfirmationDate(row.confirmationDate ?? localToday()); setDepositDate(row.date)
    setBankAccountId(row.bankAccountId ?? ''); setReason(''); setMessage('Correct the entry below. The previous values will remain in the audit history.')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage('')
    try {
      if (!selected) throw new Error('Select a variable or hourly income source')
      if (!workPeriodStart || !workPeriodEnd || workPeriodEnd < workPeriodStart) throw new Error('Enter a valid work period')
      if (regularHours === '' || overtimeHours === '') throw new Error('Enter actual regular and overtime hours, using 0 when none')
      if (net === '' || Number(net) < 0) throw new Error('Enter the actual net amount deposited')
      if (!confirmationDate || !depositDate) throw new Error('Enter confirmation and deposit dates')
      if (editingId && !reason.trim()) throw new Error('Enter a reason for the correction')
      const gross = actualGross === '' ? null : Number(actualGross)
      const withheld = deductions === '' ? null : Number(deductions)
      if (gross !== null && withheld !== null && Math.abs(gross - withheld - Number(net)) > 0.01) throw new Error('Gross minus deductions must equal net deposit')
      const now = new Date().toISOString()
      const record = incomeTransactionSchema.parse({ ...(old ?? newBase(name.trim() || 'Paycheck')), name: name.trim() || 'Paycheck', sourceId, bankAccountId: bankAccountId || null, amount: Number(net), date: depositDate, gross, deductions: withheld, regularHours: Number(regularHours), overtimeHours: Number(overtimeHours), overtimeMultiplier: Number(overtimeMultiplier), hourlyRateSnapshot: old?.hourlyRateSnapshot ?? selected.hourlyRate, workPeriodStart, workPeriodEnd, confirmationDate, notes: editingId ? reason.trim() : '', confidence: 'confirmed', updatedAt: now })
      await onSave(record)
      setEditingId(null); setWorkPeriodStart(''); setWorkPeriodEnd(''); setRegularHours(''); setOvertimeHours(''); setActualGross(''); setDeductions(''); setNet(''); setReason('')
      setMessage('Confirmed paycheck saved in SQLite.')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  return <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
    <Card className="min-w-0 p-5"><h2 className="text-lg font-semibold">Thursday paycheck confirmation</h2><p className="mt-1 text-sm text-slate-400">Enter hours and confirm the actual deposit. An estimate alone never creates income.</p>
      {!sources.length && <p className="mt-4 text-sm text-slate-400">Add an hourly or variable income source to start.</p>}
      <form onSubmit={save} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Income source<Select className="mt-1" value={sourceId} onChange={event => { setSourceId(event.target.value); setEditingId(null) }}><option value="">Select source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</Select></label>
        {selected && <p className="text-xs text-slate-400 sm:col-span-2">Current rate: {usd(selected.hourlyRate)} / hour. Historical corrections retain the saved rate of {old ? usd(old.hourlyRateSnapshot) : 'their original paycheck'}. {!selected.active && 'This source is inactive; it can only be used to correct prior paychecks.'}</p>}
        {state?.dueToday && <p className="text-sm text-[#b7c8b6] sm:col-span-2">Today is Thursday. {state.confirmedToday ? 'A paycheck was confirmed today.' : 'Confirm this week’s paycheck when the deposit is known.'}</p>}
        {state?.missed && <p className="text-sm text-amber-300 sm:col-span-2">No paycheck confirmed for more than a week. Check your records; no missing paycheck has been added automatically.</p>}
        <label className="text-sm">Work period start<Input className="mt-1" type="date" required value={workPeriodStart} onChange={e => setWorkPeriodStart(e.target.value)}/></label>
        <label className="text-sm">Work period end<Input className="mt-1" type="date" required value={workPeriodEnd} onChange={e => setWorkPeriodEnd(e.target.value)}/></label>
        <label className="text-sm">Regular hours<Input className="mt-1" type="number" min="0" step="0.01" required value={regularHours} onChange={e => setRegularHours(e.target.value)}/></label>
        <label className="text-sm">Overtime hours<Input className="mt-1" type="number" min="0" step="0.01" required value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)}/></label>
        <label className="text-sm">Overtime multiplier<Input className="mt-1" type="number" min="1" step="0.01" required value={overtimeMultiplier} onChange={e => setOvertimeMultiplier(e.target.value)}/></label>
        <div className="self-end rounded-lg border border-white/10 p-3 text-sm">Estimated gross <strong className="ml-2">{usd(grossEstimate)}</strong></div>
        <label className="text-sm">Actual gross<Input className="mt-1" type="number" min="0" step="0.01" value={actualGross} onChange={e => setActualGross(e.target.value)}/></label>
        <label className="text-sm">Deductions<Input className="mt-1" type="number" min="0" step="0.01" value={deductions} onChange={e => setDeductions(e.target.value)}/></label>
        <label className="text-sm">Actual net deposited<Input className="mt-1" type="number" min="0" step="0.01" required value={net} onChange={e => setNet(e.target.value)}/></label>
        <label className="text-sm">Deposited to<Select className="mt-1" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}><option value="">No account selected</option>{data.bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>
        <label className="text-sm">Confirmation date<Input className="mt-1" type="date" required value={confirmationDate} onChange={e => setConfirmationDate(e.target.value)}/></label>
        <label className="text-sm">Deposit date<Input className="mt-1" type="date" required value={depositDate} onChange={e => setDepositDate(e.target.value)}/></label>
        {editingId && <label className="text-sm sm:col-span-2">Correction reason<Input className="mt-1" required value={reason} onChange={e => setReason(e.target.value)}/></label>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" variant="primary" disabled={!selected || (!selected.active && !editingId)}>{editingId ? 'Save correction' : 'Confirm paycheck'}</Button>{editingId && <Button type="button" onClick={() => setEditingId(null)}>Cancel correction</Button>}</div>
        {message && <p role="status" className="text-sm text-slate-300 sm:col-span-2">{message}</p>}
      </form>
    </Card>
    <Card className="min-w-0 p-5"><h2 className="text-lg font-semibold">Confirmed income history</h2><p className="mt-1 text-sm text-slate-400">Net deposits count as available cash. Gross pay stays available for planning.</p><div className="mt-5 grid grid-cols-2 gap-3"><div>Per paid week<strong className="block text-xl">{usd(history.weeklyAverage)}</strong></div><div>Per paid month<strong className="block text-xl">{usd(history.monthlyAverage)}</strong></div></div><div className="mt-5 max-h-[32rem] space-y-2 overflow-y-auto">{data.incomeTransactions.slice().sort((a,b) => b.date.localeCompare(a.date)).map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3 text-sm"><div><strong>{row.name}</strong><p className="text-xs text-slate-400">Deposited {row.date} · {row.workPeriodStart ?? 'Period unknown'} – {row.workPeriodEnd ?? 'unknown'}</p><p className="text-xs text-slate-400">Gross {usd(row.gross)} · Net {usd(row.amount)}</p></div><Button size="small" onClick={() => edit(row)}>Correct</Button></div>)}{!data.incomeTransactions.length && <p className="text-sm text-slate-400">No paychecks confirmed yet.</p>}</div><details className="mt-4 text-sm"><summary className="cursor-pointer">Weekly and monthly totals</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><strong>Weeks</strong>{history.weekly.map(row => <p key={row.period} className="mt-1">{row.period}: {usd(row.net)}</p>)}</div><div><strong>Months</strong>{history.monthly.map(row => <p key={row.period} className="mt-1">{row.period}: {usd(row.net)}</p>)}</div></div></details></Card>
  </div>
}
