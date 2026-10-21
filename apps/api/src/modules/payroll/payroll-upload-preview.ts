import type { PublicUser, PayrollUploadPreview } from '@goxfinance/shared'
import type { PayrollRepository } from './payroll.repository'
import type { IncomeService } from '../income/income.service'
import type { PayrollUploadAccess } from './payroll-upload-access'
import { FinancialError } from '../households/financial-access'
import { localDocumentPreview } from './documents/document.service'
import { matchPayrollSources } from './payroll-source-matching'
import { signUploadReceipt } from './payroll-upload-receipt'
import { isPayrollDraft } from './payroll-draft-reconciliation'
export function payrollUploadPreview(
  store: PayrollRepository,
  income: IncomeService,
  access: PayrollUploadAccess,
) {
  function sources(user: PublicUser, home: string) {
    const data = access.list(user, home)
    const allowed = income
      .list(user, home)
      .sources.filter(
        (s) =>
          s.canManage &&
          !s.isArchived &&
          s.status === 'active' &&
          s.incomeType !== 'trading_payout',
      )
      .filter((s) => {
        try {
          access.source(user, home, s.id, true)
          return true
        } catch {
          return false
        }
      })
    return allowed.map((s) => ({
      id: s.id,
      name: s.name,
      profile: data.profiles.find((p) => p.sourceId === s.id) ?? null,
      frequency: data.profiles.find((p) => p.sourceId === s.id)?.payFrequency ?? s.frequency,
    }))
  }
  return async function preview(
    user: PublicUser,
    home: string,
    body: unknown,
  ): Promise<PayrollUploadPreview> {
    const available = sources(user, home),
      newSourceMember = access.createMember(user, home)
    if (!available.length && !newSourceMember)
      throw new FinancialError('You cannot import payroll for this household', 403)
    const data = access.list(user, home),
      receivedAt = new Date().toISOString(),
      weeks = Object.fromEntries(data.weeks.map((w) => [w.id, w.revision])),
      profiles = Object.fromEntries(available.map((s) => [s.id, s.profile?.revision ?? 0])),
      extracted = await localDocumentPreview(user.id, body),
      duplicate = store.digest(home, extracted.documentDigest)
    if (duplicate) {
      access.source(user, home, duplicate.sourceId, true)
      throw new FinancialError(
        'This document is already saved. Open its existing paycheck to make a correction.',
        409,
      )
    }
    const matches = matchPayrollSources(extracted.statement, available, store.aliases(home))
    store.receiveUpload(home, user.id, extracted.documentDigest, receivedAt)
    // A fingerprint receipt survives cancelled previews without retaining documents.
    store.atomic(() => {
      for (const candidate of available) {
        access.source(user, home, candidate.id, true)
        if (
          !store
            .history(home, candidate.id)
            .some(
              (a) =>
                a.action === 'upload_preview_received' &&
                JSON.parse(a.afterJson).digest === extracted.documentDigest,
            )
        )
          store.audit(home, candidate.id, null, user.id, 'upload_preview_received', null, {
            digest: extracted.documentDigest,
            receivedAt,
          })
      }
    })
    return {
      ...extracted,
      sources: available.map((s) => {
        const w = data.weeks.find(
          (w) =>
            w.sourceId === s.id &&
            w.workweekStart === extracted.statement.periodStart &&
            w.workweekEnd === extracted.statement.periodEnd,
        )
        return {
          ...s,
          drafts: data.weeks
            .filter((w) => w.sourceId === s.id && isPayrollDraft(w))
            .map((w) => ({
              id: w.id,
              start: w.workweekStart,
              end: w.workweekEnd,
              payDate: w.expectedPayDate,
            })),
          existingWeek: w
            ? {
                id: w.id,
                stage: w.stage,
                payFrequency: w.payFrequency ?? 'weekly',
                semiMonthlySplitDay: w.semiMonthlySplitDay ?? 15,
              }
            : undefined,
        }
      }),
      matchedSourceId: matches.length === 1 ? matches[0] : null,
      matchingSourceIds: matches,
      newSourceMember,
      receivedAt,
      receipt: signUploadReceipt({
        home,
        actor: user.id,
        digest: extracted.documentDigest,
        receivedAt,
        weeks,
        profiles,
        createMemberId: newSourceMember?.id,
      }),
    }
  }
}
