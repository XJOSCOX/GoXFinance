import { readTarget, readVerification, readLinks } from './planner-form-values'
import { useRef } from 'react'
import {
  plannerInputSchema,
  smartPlanner,
  smartForecastInput,
  plannerPriorities,
  localBillDate,
  type PlannerData,
  type PlannerRecord,
  type PlannerInput,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text } from '../../../lib/financial-entry'
import { TargetField, AccountField, VerificationFields } from './PlannerFields'
import { ArrangementFields } from './ArrangementFields'
import { AdvanceFields } from './AdvanceFields'
import { apiRequest } from '../../../lib/api'
export function PlannerEditor({
  home,
  data,
  kind,
  record,
  initial,
  close,
  saved,
}: {
  home: string
  data: PlannerData
  kind: Exclude<PlannerInput['kind'], 'balance'>
  record?: PlannerRecord
  initial?: Partial<Extract<PlannerInput, { kind: 'allocation' }>>
  close: () => void
  saved: (requested: boolean) => void
}) {
  const key = useRef(crypto.randomUUID()),
    v = record?.values,
    s = data.sources
  const funding = smartPlanner(
    s,
    smartForecastInput(data.settings, localBillDate(), 90),
    localBillDate(),
  ).funding
  const build = (f: FormData) => {
    const amount = (n: string) => readMoney(f, n, true)!,
      target = readTarget(f, s),
      common = { kind, name: text(f, 'name'), notes: text(f, 'notes') },
      verification = readVerification(f)
    let fields: unknown
    if (kind === 'priority')
      fields = {
        target,
        priority: text(f, 'priority'),
        essential: f.has('essential'),
        legalOrder: f.has('legalOrder'),
        consequence: text(f, 'consequence'),
        deadline: text(f, 'deadline') || null,
        graceDays: text(f, 'graceDays') ? Number(text(f, 'graceDays')) : null,
        lateFeeCents: readMoney(f, 'lateFee'),
        partialAllowed: text(f, 'partialAllowed'),
        verification,
        paymentAccountId: text(f, 'accountId') || null,
      }
    if (kind === 'arrangement')
      fields = {
        target,
        arrangementType: text(f, 'arrangementType'),
        provider: text(f, 'provider'),
        originalCents: amount('original'),
        financedCents: amount('financed'),
        downPaymentCents: amount('down'),
        expenseId: text(f, 'expenseId') || null,
        status: text(f, 'status'),
        verification,
        replacesOriginal: f.has('replacesOriginal'),
        coverageStart: text(f, 'coverageStart'),
        coverageEnd: text(f, 'coverageEnd'),
        installments: f.getAll('installmentId').map((raw) => {
          const id = String(raw)
          return {
            id,
            date: text(f, id + 'Date'),
            principalCents: amount(id + 'Principal'),
            feesCents: amount(id + 'Fees'),
            interestCents: amount(id + 'Interest'),
            payments: readLinks(f, id + 'Payments'),
          }
        }),
      }
    if (kind === 'advance')
      fields = {
        target,
        provider: text(f, 'provider'),
        advanceType: text(f, 'advanceType'),
        principalCents: amount('principal'),
        receivedCents: amount('received'),
        receivedDate: text(f, 'receivedDate'),
        received: f.has('receivedConfirmed'),
        feesCents: amount('fees'),
        tipsCents: amount('tips'),
        expeditedCents: amount('expedited'),
        feeCollection: text(f, 'feeCollection'),
        repaymentCents: amount('repayment'),
        repaymentDate: text(f, 'repaymentDate'),
        repaymentMethod: text(f, 'repaymentMethod'),
        payrollRepaidCents: amount('payrollRepaid'),
        autoDebit: f.has('autoDebit'),
        sourceId: text(f, 'sourceId') || null,
        payrollWeekId: text(f, 'payrollWeekId') || null,
        deductionTreatment: text(f, 'deductionTreatment'),
        verification,
        status: text(f, 'status'),
        payments: readLinks(f, 'payments'),
        accountId: text(f, 'accountId') || null,
      }
    if (kind === 'allocation')
      fields = {
        target,
        categoryId: text(f, 'categoryId') || null,
        goalId: text(f, 'goalId') || null,
        purpose: text(f, 'purpose'),
        amountCents: amount('amount'),
        date: text(f, 'date'),
        fundingEventId: text(f, 'fundingEventId') || null,
        accountId: text(f, 'accountId') || null,
        status: text(f, 'status'),
        priority: text(f, 'priority'),
        explanation: text(f, 'explanation'),
      }
    if (kind === 'preferences')
      fields = {
        essentialReserveCents: amount('reserve'),
        accountIds: [],
        useBudgetReserves: f.has('useBudgetReserves'),
      }
    return plannerInputSchema.parse({ ...common, ...(fields as object) })
  }
  const allocation = v?.kind === 'allocation' ? v : initial,
    priority = v?.kind === 'priority' ? v : undefined
  return (
    <FinancialEditor
      title={
        (record ? 'Edit ' : 'Add ') +
        {
          priority: 'obligation priority',
          arrangement: 'payment arrangement',
          advance: 'cash advance',
          allocation: 'planning allocation',
          preferences: 'living reserves',
        }[kind]
      }
      record={record}
      close={close}
      build={build}
      save={async (body) => {
        const p = body as { values: PlannerInput; reason?: string }
        const result = await apiRequest<{ request?: unknown }>(
          `households/${home}/planner/records${record ? '/' + record.id : ''}`,
          {
            method: record ? 'PATCH' : 'POST',
            body: JSON.stringify({
              ...p,
              idempotencyKey: key.current,
              revision: record?.revision ?? 0,
              fingerprint: data.fingerprint,
              reason: p.reason ?? 'User reviewed planning terms',
            }),
          },
        )
        saved(!!result.request)
      }}
      submitLabel={record?.requiresApproval ? 'Request Owner approval' : 'Save planning record'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name">
          <Input
            name="name"
            required
            maxLength={160}
            defaultValue={v?.name ?? initial?.name}
            placeholder="Short, recognizable name"
          />
        </FormField>
        {kind !== 'preferences' && (
          <TargetField
            sources={s}
            value={v && 'target' in v ? v.target : initial?.target}
            optional={kind === 'allocation'}
            kinds={
              kind === 'advance'
                ? ['debt']
                : kind === 'arrangement'
                  ? ['bill_period', 'debt']
                  : ['bill', 'bill_period', 'debt', 'expense', 'goal']
            }
          />
        )}
      </div>
      {kind === 'priority' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <Select name="priority" defaultValue={priority?.priority ?? 'important'}>
                {plannerPriorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Verified consequence">
              <Select name="consequence" defaultValue={priority?.consequence ?? 'none'}>
                {[
                  'none',
                  'housing',
                  'disconnection',
                  'repossession',
                  'judgment',
                  'health',
                  'employment',
                ].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FormField>
            <DateField
              label="Verified deadline (optional)"
              name="deadline"
              value={priority?.deadline}
            />
            <FormField label="Verified grace days (optional)">
              <Input
                name="graceDays"
                type="number"
                min={0}
                max={90}
                defaultValue={priority?.graceDays ?? ''}
              />
            </FormField>
            <AmountField
              name="lateFee"
              label="Verified late fee (USD)"
              value={priority?.lateFeeCents}
            />
            <FormField label="Partial payments">
              <Select name="partialAllowed" defaultValue={priority?.partialAllowed ?? 'unknown'}>
                <option value="unknown">Acceptance unknown</option>
                <option value="verified">Provider verified acceptance</option>
                <option value="not_allowed">Not allowed</option>
              </Select>
            </FormField>
            <AccountField sources={s} value={priority?.paymentAccountId} />
          </div>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="legalOrder" defaultChecked={priority?.legalOrder} />
            Verified court-ordered / legal obligation
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="essential" defaultChecked={priority?.essential} />
            Essential living obligation
          </label>
        </>
      )}
      {kind === 'arrangement' && (
        <ArrangementFields sources={s} value={v?.kind === 'arrangement' ? v : undefined} />
      )}
      {kind === 'advance' && (
        <AdvanceFields sources={s} value={v?.kind === 'advance' ? v : undefined} />
      )}
      {kind === 'allocation' && (
        <>
          <p className="text-sm text-slate-400">
            A reserve only. Saving does not pay a bill, change a due date, or create spending.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Purpose">
              <Select name="purpose" defaultValue={allocation?.purpose ?? 'obligation'}>
                {[
                  'obligation',
                  'essential_reserve',
                  'sinking_fund',
                  'emergency',
                  'savings',
                  'extra_debt',
                ].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FormField>
            <AmountField
              name="amount"
              label="Reserve amount (USD)"
              value={allocation?.amountCents}
              required
            />
            <DateField
              name="date"
              label="Allocation / obligation date"
              value={allocation?.date ?? localBillDate()}
              required
            />
            <FormField label="Funding source">
              <Select name="fundingEventId" defaultValue={allocation?.fundingEventId ?? ''}>
                <option value="">Automatic funding recommendation</option>
                {allocation?.fundingEventId &&
                  !funding.some((f) => f.id === allocation.fundingEventId) && (
                    <option value={allocation.fundingEventId}>
                      Prior funding is unavailable — select another source
                    </option>
                  )}
                {funding.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name} · {f.date} ·{' '}
                    {f.status === 'confirmed_cash' ? 'confirmed cash' : 'conditional'}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Category">
              <Select name="categoryId" defaultValue={allocation?.categoryId ?? ''}>
                <option value="">No category</option>
                {s.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Savings / financial goal">
              <Select name="goalId" defaultValue={allocation?.goalId ?? ''}>
                <option value="">No goal link</option>
                {s.planner?.goals?.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Decision">
              <Select name="status" defaultValue={allocation?.status ?? 'accepted'}>
                <option value="accepted">Accept / reserve</option>
                <option value="dismissed">Dismiss recommendation</option>
              </Select>
            </FormField>
            <FormField label="Allocation priority">
              <Select name="priority" defaultValue={allocation?.priority ?? 'important'}>
                {plannerPriorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </FormField>
            <AccountField sources={s} value={allocation?.accountId} />
          </div>
          <FormField label="Reason for this allocation">
            <Input
              name="explanation"
              required
              defaultValue={allocation?.explanation}
              placeholder="Why this amount and funding date work for you"
            />
          </FormField>
        </>
      )}
      {kind === 'preferences' && (
        <>
          <AmountField
            name="reserve"
            label="Essential living reserve (USD)"
            value={v?.kind === 'preferences' ? v.essentialReserveCents : 0}
            required
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="useBudgetReserves"
              defaultChecked={v?.kind === 'preferences' && v.useBudgetReserves}
            />
            Also protect remaining household food, transport, health and supplies category budgets
            for this month
          </label>
          <p className="text-xs text-slate-400">
            Categories covered by bills or explicit reserves are excluded. Budget limits remain
            separate from actual spending.
          </p>
        </>
      )}
      {['priority', 'arrangement', 'advance'].includes(kind) && (
        <VerificationFields value={v && 'verification' in v ? v.verification : undefined} />
      )}
      <FormField label="Notes (optional)">
        <Input
          name="notes"
          defaultValue={v?.notes}
          placeholder="Useful context, terms, or details"
          maxLength={4000}
        />
      </FormField>
    </FinancialEditor>
  )
}
