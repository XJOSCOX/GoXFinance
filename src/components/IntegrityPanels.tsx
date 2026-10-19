import { useState } from 'react'
import { bankLedger, budgetProgress, debtBalanceView } from '../lib/finance'
import type { Backup, Household } from '../lib/schema'
import { usd } from '../lib/utils'
import { Button, Card, Input } from './ui'

export function HouseholdPanel({ data, onSave }: { data: Backup; onSave: (household: Household) => Promise<void> }) {
  const [name, setName] = useState(data.household.name)
  const [message, setMessage] = useState('')
  return <Card className="max-w-3xl p-6"><h2 className="text-lg font-semibold">Household profile</h2><p className="mt-1 text-sm text-slate-400">This local household owns the records in the desktop database.</p><form onSubmit={async event => { event.preventDefault(); try { await onSave({ ...data.household, name: name.trim(), updatedAt: new Date().toISOString() }); setMessage('Saved in SQLite.') } catch (error) { setMessage(String(error)) } }} className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Household name<Input className="mt-1" required value={name} onChange={event => setName(event.target.value)}/></label><Button type="submit" variant="primary">Save profile</Button></form>{message && <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}<p className="mt-5 text-sm text-slate-400">{data.members.length} member records · {data.bankAccounts.length} bank accounts · {data.debts.length} debt records</p></Card>
}

export function BankAccountBalances({ data }: { data: Backup }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.bankAccounts.map(account => { const ledger = bankLedger(account, data); return <Card key={account.id} className="min-w-0 p-5"><h2 className="font-semibold">{account.name}</h2><p className="mt-1 text-xs text-slate-400">{account.accountType} · confirmed {account.confirmedAt ?? 'date unknown'}</p><p className="mt-5 text-2xl font-semibold">{usd(ledger.projected)}</p><p className="text-xs text-slate-400">Calculated balance from {usd(ledger.baseline)} starting or confirmed balance</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400"><span>Deposits {usd(ledger.income)}</span><span>Payouts {usd(ledger.payouts)}</span><span>Withdrawals {usd(ledger.expenses + ledger.payments)}</span><span>Transfers net {usd(ledger.transfersIn - ledger.transfersOut)}</span></div></Card> })}</div>
}

export function BudgetBalances({ data }: { data: Backup }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.monthlyBudgets.map(budget => { const progress = budgetProgress(data, budget); return <Card key={budget.id} className="min-w-0 p-5"><h2 className="font-semibold">{budget.name}</h2><p className="mt-1 text-xs text-slate-400">{budget.month} · actual from {progress.source}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div>Planned<strong className="block text-xl">{usd(progress.planned)}</strong></div><div>Actual<strong className="block text-xl">{usd(progress.actual)}</strong></div></div><p className="mt-3 text-sm text-slate-400">Remaining {usd(progress.variance)}</p></Card> })}</div>
}

export function DebtBalanceDetails({ data }: { data: Backup }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.debts.map(debt => { const view = debtBalanceView(debt, data); return <Card key={debt.id} className="min-w-0 p-5"><h2 className="font-semibold">{debt.creditor}</h2><p className="mt-1 text-xs text-slate-400">{debt.status} · {debt.confidence}</p><p className="mt-4 text-xl font-semibold">{usd(view.projected)}</p><p className="text-xs text-slate-400">{view.verified ? `Verified statement ${debt.verifiedAt ?? 'date unknown'}, less later recorded payments` : 'Entered balance; payment history is shown separately'}</p></Card> })}</div>
}
