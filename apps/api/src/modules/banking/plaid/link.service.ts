import { randomUUID } from 'node:crypto'
import {
  plaidLinkSchema,
  plaidExchangeSchema,
  type PublicUser,
  type PlaidAvailability,
} from '@goxfinance/shared'
import type { BankRepository } from '../bank.repository'
import type { BankPermissions } from '../bank.permissions'
import type { PlaidRepository } from './plaid.repository'
import type { PlaidRuntime } from './plaid.runtime'
import { bankHash } from '../imports/import.service'
import { FinancialError } from '../../households/financial-access'
import { safeProviderError } from './plaid.gateway'
export function plaidLinkService(
  bank: BankRepository,
  store: PlaidRepository,
  access: BankPermissions,
  runtime: PlaidRuntime,
) {
  const sessions = new Map<string, { token: string; expiresAt: string }>(),
    working = new Set<string>()
  function ready() {
    if ('disabledReason' in runtime) throw new FinancialError(runtime.disabledReason, 503)
    return runtime
  }
  function connection(user: PublicUser, home: string, id: string) {
    access.owner(user, home)
    const row = bank.connections(home).find((c) => c.id === id)
    if (!row || row.environment !== 'sandbox')
      throw new FinancialError('Bank connection not found', 404)
    if (row.status === 'disconnected')
      throw new FinancialError('This connection was removed. Create a new Sandbox connection.', 409)
    return row
  }
  function token(user: PublicUser, home: string, id: string) {
    const c = connection(user, home, id),
      r = ready()
    if (!c.tokenCiphertext || !c.tokenKeyId)
      throw new FinancialError('Bank credentials unavailable', 409)
    try {
      return { connection: c, token: r.vault.open(c.tokenCiphertext, c.tokenKeyId, home, id) }
    } catch {
      throw new FinancialError(
        'Bank token cannot be unlocked. Restore its original protected application key.',
        503,
      )
    }
  }
  return {
    connection,
    token,
    status(user: PublicUser, home: string): PlaidAvailability {
      access.owner(user, home)
      const reservedItems = store
          .attempts()
          .filter((a) => a.environment === 'sandbox' && a.intent === 'connect').length,
        itemCap = 'itemCap' in runtime ? runtime.itemCap : 10
      return {
        enabled: !('disabledReason' in runtime),
        environment: 'sandbox',
        reason: 'disabledReason' in runtime ? runtime.disabledReason : null,
        reservedItems,
        itemCap,
        remainingItems: Math.max(0, itemCap - reservedItems),
      }
    },
    async link(user: PublicUser, home: string, body: unknown) {
      access.owner(user, home)
      const p = plaidLinkSchema.parse(body),
        r = ready(),
        old = store
          .attempts()
          .find((a) => a.householdId === home && a.idempotencyKey === p.idempotencyKey)
      if (old) {
        const cache = sessions.get(old.id)
        if (
          old.actorUserId !== user.id ||
          old.connectionId !== p.connectionId ||
          !cache ||
          Date.parse(cache.expiresAt) <= Date.now()
        )
          throw new FinancialError(
            'This Link attempt cannot be reused. Start a new session; its capacity reservation is retained.',
            409,
          )
        return {
          attemptId: old.id,
          linkToken: cache.token,
          expiresAt: cache.expiresAt,
          updating: old.intent === 'update',
        }
      }
      const updating = p.connectionId ? token(user, home, p.connectionId) : null,
        now = new Date().toISOString(),
        id = randomUUID()
      bank.atomic(() => {
        if (!updating && this.status(user, home).remainingItems <= 0)
          throw new FinancialError(
            'Local lifetime Item allowance reached. Use manual imports.',
            409,
          )
        store.attempt({
          id,
          householdId: home,
          actorUserId: user.id,
          environment: 'sandbox',
          intent: updating ? 'update' : 'connect',
          connectionId: p.connectionId,
          status: 'reserved',
          idempotencyKey: p.idempotencyKey,
          publicTokenHash: null,
          expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
          createdAt: now,
        })
        bank.audit(home, user.id, id, 'link_capacity_reserved', {
          intent: updating ? 'update' : 'connect',
          environment: 'sandbox',
        })
      })
      try {
        const result = await r.gateway.link(
          bankHash(['plaid-user', home, user.id]),
          updating?.token,
        )
        bank.atomic(() => store.patchAttempt(home, id, { expiresAt: result.expiresAt }))
        for (const [key, value] of sessions)
          if (Date.parse(value.expiresAt) < Date.now()) sessions.delete(key)
        sessions.set(id, result)
        return {
          attemptId: id,
          linkToken: result.token,
          expiresAt: result.expiresAt,
          updating: !!updating,
        }
      } catch {
        bank.atomic(() => {
          store.patchAttempt(home, id, { status: 'failed' })
          bank.audit(home, user.id, id, 'link_failed', {})
        })
        throw new FinancialError(
          'Sandbox Link could not start. Its conservative capacity reservation remains consumed.',
          502,
        )
      }
    },
    async exchange(user: PublicUser, home: string, body: unknown) {
      const ctx = access.owner(user, home),
        p = plaidExchangeSchema.parse(body),
        r = ready(),
        a = store
          .attempts()
          .find((v) => v.householdId === home && v.id === p.attemptId && v.actorUserId === user.id)
      if (!a) throw new FinancialError('Link attempt not found', 404)
      const hash = bankHash(p.publicToken)
      if (a.status === 'exchanged') {
        if (a.publicTokenHash !== hash) throw new FinancialError('Link submission changed', 409)
        return { connectionId: a.connectionId, replayed: true }
      }
      if (a.status !== 'reserved' || Date.parse(a.expiresAt) <= Date.now() || working.has(a.id))
        throw new FinancialError(
          'This Link attempt is expired, uncertain or already being exchanged. Start again if needed.',
          409,
        )
      working.add(a.id)
      bank.atomic(() =>
        store.patchAttempt(home, a.id, { status: 'uncertain', publicTokenHash: hash }),
      )
      try {
        if (a.intent === 'update') {
          const current = token(user, home, a.connectionId!),
            metadata = await r.gateway.accounts(current.token)
          bank.atomic(() => {
            const fresh = connection(user, home, current.connection.id)
            if (fresh.revision !== current.connection.revision)
              throw new FinancialError('Connection changed. Retry authorization.', 409)
            store.patchConnection(home, fresh.id, {
              status: 'active',
              errorCode: null,
              revision: fresh.revision + 1,
              updatedAt: new Date().toISOString(),
              institutionId: metadata.institutionId,
            })
            store.patchAttempt(home, a.id, { status: 'exchanged' })
            bank.audit(home, user.id, fresh.id, 'authorization_updated', {})
          })
          return { connectionId: a.connectionId, replayed: false }
        }
        if (!ctx.self) throw new FinancialError('Owner member record is required', 409)
        const result = await r.gateway.exchange(p.publicToken),
          id = randomUUID(),
          now = new Date().toISOString()
        // Persist the encrypted credential immediately. Metadata/history can be retried without losing an exchanged token.
        bank.atomic(() => {
          access.owner(user, home)
          store.connection({
            id,
            householdId: home,
            environment: 'sandbox',
            providerItemId: result.itemId,
            institutionId: null,
            institution: 'Plaid Sandbox institution',
            tokenCiphertext: r.vault.seal(result.token, home, id),
            tokenKeyId: r.vault.keyId,
            cursor: null,
            status: 'active',
            errorCode: null,
            lastSyncAt: null,
            revision: 1,
            createdByUserId: user.id,
            createdAt: now,
            updatedAt: now,
          })
          store.patchAttempt(home, a.id, { status: 'exchanged', connectionId: id })
          bank.audit(home, user.id, id, 'sandbox_connected', {})
        })
        sessions.delete(a.id)
        return { connectionId: id, replayed: false }
      } catch (e) {
        if (e instanceof FinancialError) throw e
        throw new FinancialError(
          'Sandbox exchange could not be completed. No accounting records changed; the capacity reservation remains consumed.',
          502,
        )
      } finally {
        working.delete(a.id)
      }
    },
    async disconnect(user: PublicUser, home: string, id: string) {
      access.owner(user, home)
      const old = bank.connections(home).find((c) => c.id === id)
      if (old?.status === 'disconnected') return { disconnected: true }
      const current = token(user, home, id),
        r = ready()
      try {
        await r.gateway.remove(current.token)
      } catch (e) {
        if (safeProviderError(e).code !== 'INVALID_ACCESS_TOKEN')
          throw new FinancialError(
            'Provider removal was not confirmed. Connection history and credentials are retained for retry.',
            502,
          )
      }
      bank.atomic(() => {
        const fresh = connection(user, home, id)
        store.patchConnection(home, id, {
          status: 'disconnected',
          tokenCiphertext: null,
          tokenKeyId: null,
          cursor: null,
          errorCode: null,
          revision: fresh.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        bank.audit(home, user.id, id, 'institution_disconnected', {
          lifetimeCapacityRestored: false,
        })
      })
      return { disconnected: true }
    },
    disable(user: PublicUser, home: string, id: string, disabled: boolean) {
      return bank.atomic(() => {
        const c = connection(user, home, id)
        store.patchConnection(home, id, {
          status: disabled ? 'disabled' : 'active',
          revision: c.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        bank.audit(home, user.id, id, disabled ? 'sync_disabled' : 'sync_enabled', {})
        return { disabled }
      })
    },
  }
}
export type PlaidLinkService = ReturnType<typeof plaidLinkService>
