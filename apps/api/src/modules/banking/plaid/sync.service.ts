import { randomUUID } from 'node:crypto'
import type { PublicUser } from '@goxfinance/shared'
import type { BankRepository } from '../bank.repository'
import type { BankPermissions } from '../bank.permissions'
import type { PlaidRepository } from './plaid.repository'
import type { PlaidRuntime } from './plaid.runtime'
import type { PlaidLinkService } from './link.service'
import { syncApply } from './sync-apply'
import { collectSync } from './sync-pages'
import { safeProviderError } from './plaid.gateway'
import { FinancialError } from '../../households/financial-access'
export function plaidSyncService(
  bank: BankRepository,
  store: PlaidRepository,
  access: BankPermissions,
  links: PlaidLinkService,
  runtime: PlaidRuntime,
) {
  type Preview = {
    home: string
    actor: string
    connection: string
    revision: number
    expires: number
    data: Awaited<ReturnType<typeof collectSync>>
    metadata: Awaited<
      ReturnType<Extract<PlaidRuntime, { gateway: unknown }>['gateway']['accounts']>
    >
  }
  const previews = new Map<string, Preview>(),
    busy = new Set<string>(),
    apply = syncApply(bank, store)
  return {
    async preview(user: PublicUser, home: string, id: string) {
      access.owner(user, home)
      if ('disabledReason' in runtime) throw new FinancialError(runtime.disabledReason, 503)
      const current = links.token(user, home, id)
      if (current.connection.status === 'disabled')
        throw new FinancialError('Synchronization is disabled for this institution.', 409)
      if (busy.has(id)) throw new FinancialError('A synchronization is already running.', 409)
      busy.add(id)
      try {
        const metadata = await runtime.gateway.accounts(current.token),
          data = await collectSync(runtime.gateway, current.token, current.connection.cursor),
          fresh = links.connection(user, home, id)
        if (fresh.revision !== current.connection.revision)
          throw new FinancialError('Connection changed during synchronization. Start again.', 409)
        const previewId = randomUUID(),
          expires = Date.now() + 10 * 60000
        for (const [key, p] of previews)
          if (p.expires < Date.now() || p.connection === id) previews.delete(key)
        previews.set(previewId, {
          home,
          actor: user.id,
          connection: id,
          revision: fresh.revision,
          expires,
          data,
          metadata,
        })
        return {
          previewId,
          connectionId: id,
          accounts: metadata.accounts.length,
          added: data.pages.reduce((n, p) => n + p.added.length, 0),
          modified: data.pages.reduce((n, p) => n + p.modified.length, 0),
          removed: data.pages.reduce((n, p) => n + p.removed.length, 0),
          expiresAt: new Date(expires).toISOString(),
        }
      } catch (e) {
        if (e instanceof FinancialError) throw e
        const error = safeProviderError(e)
        bank.atomic(() => {
          const fresh = links.connection(user, home, id)
          if (fresh.revision === current.connection.revision) {
            store.patchConnection(home, id, {
              status: error.code === 'ITEM_LOGIN_REQUIRED' ? 'reauth_required' : 'error',
              errorCode: error.code,
              revision: fresh.revision + 1,
              updatedAt: new Date().toISOString(),
            })
            bank.audit(home, user.id, id, 'synchronization_failed', { code: error.code })
          }
        })
        throw new FinancialError(
          'Sandbox synchronization failed: ' +
            error.code +
            '. Previous cursor and accounting records are unchanged.',
          502,
        )
      } finally {
        busy.delete(id)
      }
    },
    confirm(user: PublicUser, home: string, id: string, previewId: string) {
      return bank.atomic(() => {
        const ctx = access.owner(user, home),
          p = previews.get(previewId),
          c = links.connection(user, home, id)
        if (
          !p ||
          p.home !== home ||
          p.actor !== user.id ||
          p.connection !== id ||
          p.expires < Date.now()
        )
          throw new FinancialError('Sync preview expired or was not found. Preview again.', 409)
        if (c.revision !== p.revision || c.status === 'disabled' || !ctx.self)
          throw new FinancialError('Connection changed. Preview again.', 409)
        apply.accounts(home, id, user.id, ctx.self.id, p.metadata.accounts)
        const counts = apply.transactions(home, id, p.data.pages, user.id),
          now = new Date().toISOString()
        store.patchConnection(home, id, {
          cursor: p.data.cursor,
          institutionId: p.metadata.institutionId,
          status: 'active',
          errorCode: null,
          lastSyncAt: now,
          revision: c.revision + 1,
          updatedAt: now,
        })
        bank.audit(home, user.id, id, 'synchronization_completed', {
          ...counts,
          accountCount: p.metadata.accounts.length,
        })
        // Keep the preview after success: a repeated confirmation returns a conflict, never a duplicate import.
        return counts
      })
    },
  }
}
