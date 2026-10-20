import { randomUUID, randomBytes } from 'node:crypto'
import { afterEach, vi } from 'vitest'
import { tokenVault } from './token-vault'
import type { PlaidGateway, ProviderTransaction, SyncPage } from './plaid.gateway'
const keys: Buffer[] = []
afterEach(() => {
  for (const key of keys.splice(0)) key.fill(0)
})
export const fictionalToken = 'access-sandbox-fictional-private'
export const tx = (id: string, patch: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  id,
  accountId: 'checking',
  pendingId: null,
  date: '2026-10-01',
  authorizedDate: null,
  amount: 42.18,
  currency: 'USD',
  pending: false,
  merchant: 'Fictional shop',
  description: 'Fictional groceries',
  ...patch,
})
export const page = (
  added: ProviderTransaction[] = [],
  cursor = 'cursor-1',
  patch: Partial<SyncPage> = {},
): SyncPage => ({ added, modified: [], removed: [], cursor, more: false, ...patch })
export function providerFixture(itemCap = 10) {
  const key = randomBytes(32)
  keys.push(key)
  const gateway: PlaidGateway = {
    link: vi.fn(async () => ({
      token: 'link-sandbox-fictional',
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    })),
    exchange: vi.fn(async () => ({ token: fictionalToken, itemId: randomUUID() })),
    accounts: vi.fn(async () => ({
      institutionId: 'ins-fictional',
      accounts: [
        {
          id: 'checking',
          name: 'Fictional checking',
          type: 'depository',
          subtype: 'checking',
          mask: '1234',
          currency: 'USD',
          current: 2500,
          available: 2000,
        },
      ],
    })),
    sync: vi.fn(async () => page([tx('posted-1')])),
    remove: vi.fn(async () => {}),
  }
  return { gateway, vault: tokenVault(key), itemCap, key }
}
