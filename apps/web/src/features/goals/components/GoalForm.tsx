import { useState } from 'react'
import {
  goalSchema,
  goalEndDate,
  localBillDate,
  type Goal,
  type GoalInput,
  type TradingData,
  type HouseholdMember,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField } from '../../../components/financial/EntryFields'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
export function GoalForm({
  goal,
  trading,
  members,
  allowHousehold,
  save,
  close,
}: {
  goal?: Goal
  trading: TradingData | null
  members: HouseholdMember[]
  allowHousehold: boolean
  save: (body: unknown) => Promise<void>
  close: () => void
}) {
  const [direction, setDirection] = useState(
    goal?.direction ??
      (['trading_loss', 'spending_limit'].includes(goal?.goalType ?? '') ? 'at_most' : 'at_least'),
  )
  const [type, setType] = useState<GoalInput['goalType']>(goal?.goalType ?? 'trading_profit'),
    [period, setPeriod] = useState<GoalInput['period']>(goal?.period ?? 'daily'),
    [start, setStart] = useState(goal?.startDate ?? localBillDate()),
    [link, setLink] = useState(goal?.copyGroupId ? 'group' : 'account')
  return (
    <FinancialEditor
      title={goal ? 'Edit goal' : 'Create financial goal'}
      record={goal}
      save={save}
      close={close}
      build={(data) =>
        goalSchema.parse({
          timezone: ['trading_profit', 'trading_loss'].includes(type)
            ? text(data, 'timezone')
            : null,
          sessionStart: ['trading_profit', 'trading_loss'].includes(type)
            ? text(data, 'sessionStart')
            : null,
          name: text(data, 'name'),
          goalType: type,
          targetCents: readMoney(data, 'targetCents', true),
          period,
          startDate: start,
          endDate: period === 'custom' ? text(data, 'endDate') : goalEndDate(start, period),
          responsibleMemberId: optionalText(data, 'responsibleMemberId'),
          tradingAccountId:
            ['trading_profit', 'trading_loss'].includes(type) && link === 'account'
              ? optionalText(data, 'tradingAccountId')
              : null,
          copyGroupId:
            ['trading_profit', 'trading_loss'].includes(type) && link === 'group'
              ? optionalText(data, 'copyGroupId')
              : null,
          direction: text(data, 'direction'),
          status: text(data, 'status'),
          notes: optionalText(data, 'notes'),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Goal name">
          <Input name="name" defaultValue={goal?.name} required />
        </FormField>
        <FormField label="Goal type">
          <Select
            value={type}
            onChange={(e) => {
              const next = e.target.value as typeof type
              setType(next)
              setDirection(
                ['trading_loss', 'spending_limit'].includes(next) ? 'at_most' : 'at_least',
              )
            }}
          >
            {Object.entries({
              trading_profit: 'Trading net profit',
              trading_loss: 'Trading net loss budget',
              confirmed_income: 'Confirmed income',
              savings: 'Savings contributions',
              debt_reduction: 'Verified debt reduction',
              spending_limit: 'Purchase spending limit',
              bill_completion: 'Bill payments completed',
              manual: 'Custom manual contributions',
            }).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <AmountField
          label="Target amount ($)"
          name="targetCents"
          value={goal?.targetCents}
          required
        />
        <FormField label="Direction">
          <Select
            name="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="at_least">Reach at least</option>
            <option value="at_most">Stay at or below</option>
          </Select>
        </FormField>
        <FormField label="Period">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            {['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="First period starts">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </FormField>
        <FormField label={period === 'custom' ? 'Custom end date' : 'First period ends'}>
          <Input
            key={period}
            name="endDate"
            type="date"
            required
            readOnly={period !== 'custom'}
            value={period === 'custom' ? undefined : goalEndDate(start, period)}
            defaultValue={period === 'custom' ? goal?.endDate : undefined}
          />
        </FormField>
        <FormField label="Responsible member">
          <Select
            name="responsibleMemberId"
            defaultValue={goal?.responsibleMemberId ?? (allowHousehold ? '' : members[0]?.id)}
          >
            {allowHousehold && <option value="">Whole household</option>}
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Goal state">
          <Select name="status" defaultValue={goal?.status ?? 'active'}>
            {['active', 'paused', 'completed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
      </div>
      {['trading_profit', 'trading_loss'].includes(type) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Goal trading timezone (IANA)">
              <Input
                name="timezone"
                defaultValue={goal?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
                required
              />
            </FormField>
            <FormField label="Goal session starts at">
              <Input
                name="sessionStart"
                type="time"
                defaultValue={goal?.sessionStart ?? ''}
                required
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Trading scope">
              <Select value={link} onChange={(e) => setLink(e.target.value)}>
                <option value="account">Account / combined accounts</option>
                <option value="group">Copy-trading group</option>
              </Select>
            </FormField>
            {link === 'account' ? (
              <FormField label="Linked account">
                <Select name="tradingAccountId" defaultValue={goal?.tradingAccountId ?? ''}>
                  <option value="">All accounts for the selected member / household</option>
                  {trading?.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nickname}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Linked copy group">
                <Select name="copyGroupId" defaultValue={goal?.copyGroupId ?? ''} required>
                  <option value="">Select group</option>
                  {trading?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
        </>
      )}
      <p className="text-xs leading-5 text-slate-400">
        Recurring periods are anchored to the first start date; historical periods use the current
        goal definition. Savings and custom goals use explicit contributions, not bank balances.
        Trading loss budgets measure net loss magnitude; profit goals retain negative P&amp;L.
        Targets are personal milestones, not provider rules or a reason to increase risk.
      </p>
      <FormField label="Notes">
        <Input name="notes" defaultValue={goal?.notes ?? ''} />
      </FormField>
    </FinancialEditor>
  )
}
