import { randomUUID } from 'node:crypto'
import type { BankRepository } from '../bank.repository'
import type { PlaidRepository } from './plaid.repository'
import type { ProviderAccount, SyncPage } from './plaid.gateway'
import { providerAccount, providerTransaction } from './provider-data'
import { bankHash } from '../imports/import.service'
import { FinancialError } from '../../households/financial-access'
export function syncApply(bank: BankRepository, store: PlaidRepository) {
  function accounts(
    home: string,
    connection: string,
    actor: string,
    member: string,
    source: ProviderAccount[],
  ) {
    const now = new Date().toISOString(),
      run = randomUUID(),
      seen = new Set<string>()
    for (const raw of source) {
      if (seen.has(raw.id)) throw new FinancialError('Provider returned duplicate accounts', 502)
      seen.add(raw.id)
      const a = providerAccount(raw)
      if (!a) continue
      const old = bank
          .accounts(home)
          .find((v) => v.connectionId === connection && v.providerAccountId === a.id),
        id = old?.id ?? randomUUID()
      if (
        old &&
        (old.type !== a.type || old.currency !== a.currency) &&
        bank.transactions(home).some((t) => t.accountId === id)
      )
        throw new FinancialError(
          'Provider changed account type or currency. Review before synchronizing.',
          409,
        )
      const fields = {
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        currency: a.currency,
        updatedAt: now,
      }
      if (old) {
        if (
          ['type', 'subtype', 'mask', 'currency'].some(
            (k) => old[k as keyof typeof old] !== fields[k as keyof typeof fields],
          )
        )
          store.patchAccount(home, id, { ...fields, revision: old.revision + 1 })
      } else
        store.account(
          {
            ...fields,
            id,
            householdId: home,
            connectionId: connection,
            providerAccountId: a.id,
            name: a.name,
            institution: 'Plaid Sandbox institution',
            status: 'active',
            assetId: null,
            debtId: null,
            revision: 1,
            idempotencyKey: randomUUID(),
            createdByUserId: actor,
            createdAt: now,
          },
          member,
        )
      bank.balance(
        home,
        id,
        {
          currentCents: a.currentCents,
          availableCents: a.availableCents,
          observedAt: now,
          notes: null,
        },
        run,
        'plaid_cached',
      )
    }
  }
  return {
    accounts,
    transactions(home: string, connection: string, pages: SyncPage[], actor: string) {
      const linkedAccounts = bank.accounts(home).filter((a) => a.connectionId === connection),
        now = new Date().toISOString()
      let added = 0,
        modified = 0,
        removed = 0
      for (const page of pages) {
        for (const raw of [...page.added, ...page.modified]) {
          // Zero-value provider events are not cash activity; retain the cursor without fabricating an accounting amount.
          if (raw.amount === 0) continue
          const t = providerTransaction(raw),
            account = linkedAccounts.find((a) => a.providerAccountId === t.accountId)
          if (!account) continue // Unsupported account types never enter this module.
          if (account.currency && t.values.currency !== account.currency)
            throw new FinancialError('Provider transaction currency mismatch', 502)
          const old = bank
              .transactions(home)
              .find((v) => v.accountId === account.id && v.providerTransactionId === t.id),
            { externalId: unused, ...values } = t.values
          void unused
          if (old) {
            const changed =
              Object.entries(values).some(([k, v]) => old[k as keyof typeof old] !== v) ||
              old.removed ||
              old.pendingProviderId !== t.pendingId
            if (changed) {
              store.patchTransaction(home, old.id, {
                ...values,
                pendingProviderId: t.pendingId,
                removed: false,
                reviewStatus: ['reconciled', 'needs_review'].includes(old.reviewStatus)
                  ? 'needs_review'
                  : old.reviewStatus,
                revision: old.revision + 1,
                updatedAt: now,
              })
              modified++
              bank.audit(home, actor, old.id, 'provider_transaction_changed', {})
            }
          } else {
            store.transaction({
              ...values,
              id: randomUUID(),
              householdId: home,
              accountId: account.id,
              source: 'plaid',
              providerTransactionId: t.id,
              fingerprint: bankHash(['plaid', connection, account.id, t.id]),
              batchId: null,
              pendingProviderId: t.pendingId,
              replacedById: null,
              removed: false,
              reviewStatus: 'unreviewed',
              revision: 1,
              createdAt: now,
              updatedAt: now,
            })
            added++
          }
        }
        for (const providerId of page.removed) {
          const old = bank
            .transactions(home)
            .find(
              (v) =>
                linkedAccounts.some((a) => a.id === v.accountId) &&
                v.providerTransactionId === providerId,
            )
          if (old && !old.removed) {
            store.patchTransaction(home, old.id, {
              removed: true,
              merchant: null,
              description: 'Provider removed transaction',
              reviewStatus: ['reconciled', 'needs_review'].includes(old.reviewStatus)
                ? 'needs_review'
                : old.reviewStatus,
              revision: old.revision + 1,
              updatedAt: now,
            })
            removed++
            bank.audit(home, actor, old.id, 'provider_transaction_removed', {})
          }
        }
      }
      const records = bank
        .transactions(home)
        .filter((t) => linkedAccounts.some((a) => a.id === t.accountId))
      for (const posted of records.filter((t) => !t.pending && !t.removed && t.pendingProviderId)) {
        const pending = records.find(
          (t) =>
            t.accountId === posted.accountId &&
            t.providerTransactionId === posted.pendingProviderId,
        )
        if (pending && pending.replacedById !== posted.id)
          store.patchTransaction(home, pending.id, {
            replacedById: posted.id,
            reviewStatus: 'superseded',
            revision: pending.revision + 1,
            updatedAt: now,
          })
      }
      return { added, modified, removed }
    },
  }
}
