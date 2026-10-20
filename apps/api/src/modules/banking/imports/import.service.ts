import { createHash, randomUUID } from 'node:crypto'
import {
  manualImportSchema,
  confirmManualImportSchema,
  bankTransactionSchema,
  bankSuggestion,
  normalizeBankMerchant,
  type PublicUser,
  type ImportPreview,
  type BankTransaction,
  type BankInbox,
  type BankTransactionInput,
} from '@goxfinance/shared'
import type { BankRepository } from '../bank.repository'
import type { BankPermissions } from '../bank.permissions'
import type { BankService } from '../bank.service'
import type { ImportRepository } from './import.repository'
import { FinancialError } from '../../households/financial-access'
import { csvRows, parseStatement, safeBankText } from './statement-parser'
export const bankHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
function fingerprints(rows: { values: BankTransactionInput | null }[], source: string) {
  const counts = new Map<string, number>()
  return rows.map((r) => {
    if (!r.values) return ''
    const { externalId, ...values } = r.values,
      base = externalId
        ? bankHash([source, externalId])
        : bankHash([
            values.date,
            values.amountCents,
            values.currency,
            values.description.toLowerCase(),
            values.merchant?.toLowerCase() ?? '',
          ])
    const occurrence = counts.get(base) ?? 0
    counts.set(base, occurrence + 1)
    return bankHash([source, base, occurrence])
  })
}
export function importService(
  bank: BankRepository,
  store: ImportRepository,
  access: BankPermissions,
  accounts: BankService,
) {
  async function preview(user: PublicUser, home: string, body: unknown): Promise<ImportPreview> {
    const input = manualImportSchema.parse(body),
      account = access.account(user, home, input.accountId, true)
    if (account.status !== 'active')
      throw new FinancialError('Restore the account before importing.', 409)
    const parsed = await parseStatement(input, account.currency),
      keys = fingerprints(parsed, input.format),
      existing = bank.transactions(home).filter((t) => t.accountId === account.id),
      seenReferences = new Set<string>()
    const rows = parsed.map((r, i) => {
      if (r.values?.externalId) {
        if (seenReferences.has(r.values.externalId))
          return {
            ...r,
            values: null,
            duplicate: false,
            possibleDuplicate: false,
            error: 'Repeated statement reference. Correct duplicate FITID/reference rows.',
          }
        seenReferences.add(r.values.externalId)
      }
      return {
        ...r,
        duplicate: existing.some((t) => t.fingerprint === keys[i]),
        possibleDuplicate:
          !!r.values &&
          existing.some(
            (t) =>
              t.fingerprint !== keys[i] &&
              !t.removed &&
              t.date === r.values!.date &&
              t.amountCents === r.values!.amountCents,
          ),
      }
    })
    return {
      hash: bankHash({ input, revision: account.revision, rows }),
      accountRevision: account.revision,
      rows,
      validCount: rows.filter((r) => r.values).length,
      invalidCount: rows.filter((r) => !r.values).length,
      duplicateCount: rows.filter((r) => r.duplicate).length,
      possibleDuplicateCount: rows.filter((r) => r.possibleDuplicate).length,
    }
  }
  return {
    preview,
    async columns(user: PublicUser, home: string, accountId: string, text: string) {
      access.account(user, home, accountId, true)
      const [headers, ...rows] = await csvRows(text)
      return { headers, samples: rows.slice(0, 3).map((r) => r.map(safeBankText)) }
    },
    async confirm(user: PublicUser, home: string, body: unknown) {
      const p = confirmManualImportSchema.parse(body)
      access.account(user, home, p.input.accountId, true)
      const sourceHash = bankHash({
          input: p.input,
          selected: p.selectedRows,
          allow: p.confirmPossibleDuplicates,
        }),
        old = store.batches(home).find((b) => b.idempotencyKey === p.idempotencyKey)
      if (old) {
        if (old.actorUserId !== user.id || old.sourceHash !== sourceHash)
          throw new FinancialError('Submission key already used', 409)
        return { imported: old.recordCount, batchId: old.id, replayed: true }
      }
      const data = await preview(user, home, p.input)
      return bank.atomic(() => {
        const prior = store.batches(home).find((b) => b.idempotencyKey === p.idempotencyKey)
        if (prior) {
          if (prior.actorUserId !== user.id || prior.sourceHash !== sourceHash)
            throw new FinancialError('Submission key already used', 409)
          return { imported: prior.recordCount, batchId: prior.id, replayed: true }
        }
        const account = access.account(user, home, p.input.accountId, true)
        if (data.hash !== p.previewHash || account.revision !== data.accountRevision)
          throw new FinancialError(
            'Import preview or account changed. Preview again before importing.',
            409,
          )
        const selected = p.selectedRows.map((i) => data.rows.find((r) => r.index === i))
        if (selected.some((r) => !r?.values))
          throw new FinancialError('Select only valid preview rows', 400)
        if (selected.some((r) => r!.possibleDuplicate) && !p.confirmPossibleDuplicates)
          throw new FinancialError(
            'Confirm potential duplicate rows explicitly or leave them unselected.',
            409,
          )
        const now = new Date().toISOString(),
          id = randomUUID(),
          keys = fingerprints(data.rows, p.input.format),
          rows = selected.filter((r) => !r!.duplicate)
        const current = bank.transactions(home).filter((t) => t.accountId === account.id)
        if (
          rows.some((r) =>
            current.some(
              (t) =>
                t.fingerprint === keys[r!.index] ||
                (!p.confirmPossibleDuplicates &&
                  !t.removed &&
                  t.date === r!.values!.date &&
                  t.amountCents === r!.values!.amountCents),
            ),
          )
        )
          throw new FinancialError('Transactions changed during preview. Preview again.', 409)
        store.batch({
          id,
          householdId: home,
          accountId: account.id,
          source: p.input.format,
          sourceHash,
          idempotencyKey: p.idempotencyKey,
          actorUserId: user.id,
          recordCount: rows.length,
          createdAt: now,
        })
        for (const r of rows) {
          const { externalId: unused, ...v } = r!.values!
          void unused
          store.transaction({
            ...v,
            id: randomUUID(),
            householdId: home,
            accountId: account.id,
            source: p.input.format,
            providerTransactionId: null,
            fingerprint: keys[r!.index],
            batchId: id,
            pendingProviderId: null,
            replacedById: null,
            removed: false,
            reviewStatus: 'unreviewed',
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
        }
        bank.audit(home, user.id, account.id, 'statement_imported', {
          batchId: id,
          count: rows.length,
          skipped: selected.length - rows.length,
        })
        return { imported: rows.length, batchId: id, replayed: false }
      })
    },
    inbox(
      user: PublicUser,
      home: string,
    ): BankInbox & { suggestions: Record<string, ReturnType<typeof bankSuggestion>> } {
      const ctx = access.context(user, home),
        data = accounts.list(user, home),
        ids = new Set(data.accounts.map((a) => a.id)),
        legs = store.legs(home),
        learnedRules = new Map(data.accounts.map((a) => [a.id, store.rules(home, a.id)])),
        transactions = bank
          .transactions(home)
          .filter((t) => ids.has(t.accountId))
          .map((t) => {
            const v = bankTransactionSchema.parse({
                date: t.date,
                authorizedDate: t.authorizedDate,
                amountCents: t.amountCents,
                currency: t.currency,
                pending: t.pending,
                merchant: t.merchant,
                description: t.description,
                externalId: null,
              }),
              { externalId: unused, ...values } = v
            void unused
            return {
              ...values,
              id: t.id,
              householdId: home,
              accountId: t.accountId,
              source: t.source as BankTransaction['source'],
              revision: t.revision,
              reviewStatus: t.reviewStatus as BankTransaction['reviewStatus'],
              removed: t.removed,
              replacedById: t.replacedById,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
              ...(legs.some((l) => l.transactionId === t.id)
                ? {
                    transferStatus:
                      legs.filter(
                        (l) =>
                          l.transferId === legs.find((v) => v.transactionId === t.id)!.transferId,
                      ).length === 2
                        ? ('paired' as const)
                        : ('unmatched' as const),
                  }
                : {}),
            }
          }),
        txIds = new Set(transactions.map((t) => t.id))
      return {
        transactions,
        accounts: data.accounts,
        owner: ctx.role === 'owner',
        canReview: ctx.role !== 'viewer',
        requests: store
          .requests(home)
          .filter(
            (r) =>
              txIds.has(r.transactionId) &&
              (ctx.role === 'owner' || r.proposedByUserId === user.id),
          )
          .map((r) => ({
            id: r.id,
            transactionId: r.transactionId,
            status: r.status,
            proposal: JSON.parse(r.proposalJson).proposal ?? JSON.parse(r.proposalJson),
            proposedBy: r.proposedByUserId,
            proposedByName:
              ctx.people.find((m) => m.linkedUserId === r.proposedByUserId)?.fullName ??
              'Former member',
            createdAt: r.createdAt,
          })),
        suggestions: Object.fromEntries(
          transactions.map((t) => [
            t.id,
            (() => {
              const rule =
                t.merchant && t.amountCents < 0
                  ? learnedRules
                      .get(t.accountId)
                      ?.find((r) => r.merchant === normalizeBankMerchant(t.merchant!))
                  : null
              return rule
                ? {
                    classification: rule.classification,
                    category: null,
                    categoryId: rule.categoryId,
                    reason:
                      'Previously Owner-approved merchant/category rule for this account. Review before recording.',
                  }
                : bankSuggestion(
                    t.merchant,
                    t.description,
                    t.amountCents,
                    data.accounts.find((a) => a.id === t.accountId)?.type === 'credit_card',
                  )
            })(),
          ]),
        ),
      }
    },
  }
}
export type ImportService = ReturnType<typeof importService>
