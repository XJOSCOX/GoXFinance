import { useState, useEffect } from 'react'
import {
  payrollSemiMonthlyBoundary,
  type PayrollFrequency,
  type PayrollWeek,
  type PayrollUploadPreview,
  type PayrollStatement,
} from '@goxfinance/shared'
import { PayrollReviewForm } from './PayrollReviewForm'
import { FormField, Select } from '../../../components/ui/FormField'
import { Input } from '../../../components/ui'
import { apiRequest } from '../../../lib/api'
import { payrollBase } from './payrollClient'
import { PayrollPeriodChoice } from './PayrollPeriodChoice'
import { suggestPayrollFrequency } from './payroll-frequency'
const NEW_EMPLOYER = '__new__'
export function PayrollUploadReview({
  home,
  preview,
  preferredSourceId,
  close,
  saved,
}: {
  home: string
  preview: PayrollUploadPreview
  preferredSourceId?: string
  close: () => void
  saved: (sourceId: string) => void
}) {
  const initialId =
    preferredSourceId && preview.sources.some((s) => s.id === preferredSourceId)
      ? preferredSourceId
      : (preview.matchedSourceId ??
        (preview.newSourceMember && !preview.matchingSourceIds?.length ? NEW_EMPLOYER : ''))
  const [sourceId, setSourceId] = useState(initialId),
    [current, setCurrent] = useState(preview.statement),
    [frequency, setFrequency] = useState<PayrollFrequency | ''>(() =>
      suggestPayrollFrequency(
        preview.statement,
        preview.sources.find((s) => s.id === initialId),
      ),
    ),
    [touched, setTouched] = useState(false),
    [split, setSplit] = useState(
      payrollSemiMonthlyBoundary(preview.statement.periodStart, preview.statement.periodEnd) ?? 15,
    )
  useEffect(() => {
    if (!touched)
      setFrequency(
        suggestPayrollFrequency(
          current,
          preview.sources.find((s) => s.id === sourceId),
        ),
      )
  }, [current, preview.sources, sourceId, touched])
  const selected = preview.sources.find((s) => s.id === sourceId)
  return (
    <PayrollReviewForm
      initial={preview.statement}
      warnings={preview.warnings}
      close={close}
      onReviewChange={setCurrent}
      buildExtra={(f) => ({
        ...(sourceId === NEW_EMPLOYER
          ? { newSource: { name: String(f.get('sourceName') || '') } }
          : { sourceId }),
        payFrequency: frequency || undefined,
        semiMonthlySplitDay: split,
      })}
      save={async (raw) => {
        const b = raw as {
          idempotencyKey: string
          values: { statement: PayrollStatement; extra: object }
        }
        const week = await apiRequest<PayrollWeek>(payrollBase(home) + '/upload/save', {
          method: 'POST',
          body: JSON.stringify({
            receipt: preview.receipt,
            idempotencyKey: b.idempotencyKey,
            statement: b.values.statement,
            ...b.values.extra,
          }),
        })
        saved(week.sourceId)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Employer / income source">
          <Select
            value={sourceId}
            required
            onChange={(e) => {
              setSourceId(e.target.value)
              setTouched(false)
            }}
          >
            <option value="">Select employer</option>
            {preview.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {preview.newSourceMember && <option value={NEW_EMPLOYER}>Add detected employer</option>}
          </Select>
        </FormField>
        {sourceId === NEW_EMPLOYER && (
          <FormField label="New employer name">
            <Input
              name="sourceName"
              required
              maxLength={160}
              defaultValue={preview.statement.employer || preview.statement.assignment || ''}
            />
          </FormField>
        )}
      </div>
      {sourceId === NEW_EMPLOYER && (
        <p className="text-xs text-slate-400">
          Employer and paycheck will be saved together for {preview.newSourceMember?.name}. No
          future hours or income will be assumed.
        </p>
      )}
      {preferredSourceId &&
        preview.matchedSourceId &&
        preferredSourceId !== preview.matchedSourceId && (
          <p role="status" className="text-sm text-amber-200">
            The detected employer matches another source. Review your selection before saving.
          </p>
        )}
      <PayrollPeriodChoice
        frequency={frequency}
        change={(v) => {
          setFrequency(v)
          setTouched(true)
        }}
        split={split}
        setSplit={setSplit}
        statement={current}
        source={selected}
      />
      {selected?.existingWeek && (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 p-3 text-xs text-amber-200"
        >
          This period already exists ({selected.existingWeek.stage.replaceAll('_', ' ')}). Saving
          appends an audited statement version; confirmed deposits stay unchanged.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Expected deposit: {current.payDate ?? 'Enter the printed payday below'}. Confirm received
        after the money arrives; you can adjust the deposit date then.
      </p>
    </PayrollReviewForm>
  )
}
