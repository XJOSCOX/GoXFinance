import { useState } from 'react'
import {
  settlementSchema,
  localBillDate,
  type PlanningData,
  type SettlementOffer,
} from '@goxfinance/shared'
import { FinancialEditor } from '../../../components/financial/FinancialEditor'
import { AmountField, DateField } from '../../../components/financial/EntryFields'
import { Button, Input } from '../../../components/ui'
import { FormField, Select } from '../../../components/ui/FormField'
import { readMoney, text, optionalText } from '../../../lib/financial-entry'
import { formatMoney } from '../../../lib/money'
export function SettlementForm({
  data,
  record,
  save,
  close,
}: {
  data: PlanningData
  record?: SettlementOffer
  save: (v: unknown) => Promise<void>
  close: () => void
}) {
  const [debtId, setDebt] = useState(record?.debtId ?? data.editableDebtIds[0] ?? ''),
    [kind, setKind] = useState(record?.kind ?? 'lump_sum'),
    [schedule, setSchedule] = useState(
      record?.schedule ?? [
        { id: crypto.randomUUID(), dueDate: localBillDate(), amountCents: 0, paymentId: null },
      ],
    )
  return (
    <FinancialEditor
      title={record ? 'Edit settlement offer' : 'Add settlement offer'}
      record={record}
      save={save}
      close={close}
      submitLabel="Save offer"
      build={(f) =>
        settlementSchema.parse({
          debtId,
          creditor: text(f, 'creditor'),
          originalBalanceCents: readMoney(f, 'original'),
          amountCents: readMoney(f, 'total', true),
          offerDate: text(f, 'offerDate'),
          expirationDate: optionalText(f, 'expirationDate'),
          kind,
          status: text(f, 'status'),
          writtenConfirmed: f.has('written'),
          notes: optionalText(f, 'notes'),
          document: text(f, 'document')
            ? { name: text(f, 'document'), reference: optionalText(f, 'reference') }
            : null,
          schedule: schedule.map((s) => ({
            id: s.id,
            dueDate: text(f, s.id + ':date'),
            amountCents: readMoney(f, s.id + ':amount', true),
            paymentId: optionalText(f, s.id + ':payment'),
          })),
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Debt">
          <Select disabled={!!record} value={debtId} onChange={(e) => setDebt(e.target.value)}>
            {data.debts
              .filter((d) => data.editableDebtIds.includes(d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.accountNickname || d.creditorName}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Creditor or agency">
          <Input name="creditor" required defaultValue={record?.creditor ?? ''} />
        </FormField>
        <AmountField
          label="Balance at time of offer ($)"
          name="original"
          value={record?.originalBalanceCents}
        />
        <AmountField
          label="Total settlement obligation ($)"
          name="total"
          value={record?.amountCents}
          required
        />
        <DateField
          label="Offer date"
          name="offerDate"
          value={record?.offerDate ?? localBillDate()}
          required
        />
        <DateField label="Offer expires" name="expirationDate" value={record?.expirationDate} />
        <FormField label="Settlement type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="lump_sum">Lump sum</option>
            <option value="installments">Installments</option>
          </Select>
        </FormField>
        <FormField label="Negotiation status">
          <Select name="status" defaultValue={record?.status ?? 'offered'}>
            {[
              'offered',
              'negotiating',
              'accepted',
              'rejected',
              'expired',
              'completed',
              'cancelled',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="written" type="checkbox" defaultChecked={record?.writtenConfirmed} />
        Written agreement received
      </label>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Initial payment & installments</h3>
        <p className="text-xs text-slate-400">
          Schedule amounts must equal the total obligation. Link payments already recorded in Debt
          details; scheduling never creates a payment.
        </p>
        {schedule.map((s, i) => (
          <div key={s.id} className="rounded-xl border border-white/10 p-3">
            <p className="mb-2 text-xs text-slate-400">
              {i === 0 ? 'Initial payment' : `Installment ${i}`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField label="Due date" name={s.id + ':date'} value={s.dueDate} required />
              <AmountField
                label="Amount ($)"
                name={s.id + ':amount'}
                value={s.amountCents}
                required
              />
              <FormField label="Linked debt payment">
                <Select name={s.id + ':payment'} defaultValue={s.paymentId ?? ''}>
                  <option value="">No payment recorded</option>
                  {data.payments
                    .filter((p) => p.debtId === debtId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.paymentDate} · {formatMoney(p.amountCents)} · {p.paymentStatus}
                      </option>
                    ))}
                </Select>
              </FormField>
              {schedule.length > 1 && (
                <Button
                  type="button"
                  onClick={() => setSchedule(schedule.filter((r) => r.id !== s.id))}
                >
                  Remove installment
                </Button>
              )}
            </div>
          </div>
        ))}
        {kind === 'installments' && (
          <Button
            type="button"
            onClick={() =>
              setSchedule([
                ...schedule,
                {
                  id: crypto.randomUUID(),
                  dueDate: localBillDate(),
                  amountCents: 0,
                  paymentId: null,
                },
              ])
            }
          >
            Add installment
          </Button>
        )}
      </section>
      <FormField label="Notes">
        <Input name="notes" defaultValue={record?.notes ?? ''} />
      </FormField>
      <details>
        <summary className="text-sm text-slate-400">Supporting document metadata</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Document name">
            <Input name="document" defaultValue={record?.document?.name ?? ''} />
          </FormField>
          <FormField label="Local reference (no upload)">
            <Input name="reference" defaultValue={record?.document?.reference ?? ''} />
          </FormField>
        </div>
      </details>
      <p className="text-xs text-slate-500">
        Acceptance does not settle the debt. Completion requires recorded payments and separate
        verified creditor reconciliation in Debt details. Tax or credit implications require
        independent verification.
      </p>
    </FinancialEditor>
  )
}
