import { afterEach, expect, it, vi } from 'vitest'
import { PlaidApi, Products } from 'plaid'
import { sandboxGateway, safeProviderError } from './plaid.gateway'
afterEach(() => vi.restoreAllMocks())
it('uses official SDK Link/exchange/accounts/sync/removal only, with Transactions and no optional products', async () => {
  const link = vi
      .spyOn(PlaidApi.prototype, 'linkTokenCreate')
      .mockResolvedValue({
        data: { link_token: 'fictional-link', expiration: '2026-10-21T00:00:00Z' },
      } as never),
    exchange = vi
      .spyOn(PlaidApi.prototype, 'itemPublicTokenExchange')
      .mockResolvedValue({
        data: { access_token: 'fictional-permanent', item_id: 'fictional-item' },
      } as never),
    accounts = vi
      .spyOn(PlaidApi.prototype, 'accountsGet')
      .mockResolvedValue({
        data: { item: { institution_id: 'fictional-bank' }, accounts: [] },
      } as never),
    sync = vi
      .spyOn(PlaidApi.prototype, 'transactionsSync')
      .mockResolvedValue({
        data: { added: [], modified: [], removed: [], next_cursor: 'next', has_more: false },
      } as never),
    remove = vi.spyOn(PlaidApi.prototype, 'itemRemove').mockResolvedValue({ data: {} } as never),
    balance = vi.spyOn(PlaidApi.prototype, 'accountsBalanceGet'),
    refresh = vi.spyOn(PlaidApi.prototype, 'transactionsRefresh'),
    gateway = sandboxGateway('fictional-client', 'fictional-secret')
  expect(await gateway.link('opaque-user')).toMatchObject({ token: 'fictional-link' })
  expect(link.mock.calls[0][0]).toMatchObject({
    products: [Products.Transactions],
    user: { client_user_id: 'opaque-user' },
  })
  expect(link.mock.calls[0][0]).not.toHaveProperty('optional_products')
  await gateway.link('opaque-user', 'fictional-permanent')
  expect(link.mock.calls[1][0]).toHaveProperty('access_token', 'fictional-permanent')
  expect(link.mock.calls[1][0]).not.toHaveProperty('products')
  expect(await gateway.exchange('fictional-public')).toEqual({
    token: 'fictional-permanent',
    itemId: 'fictional-item',
  })
  await gateway.accounts('fictional-permanent')
  await gateway.sync('fictional-permanent', 'previous')
  await gateway.remove('fictional-permanent')
  expect(exchange).toHaveBeenCalledWith({ public_token: 'fictional-public' })
  expect(accounts).toHaveBeenCalledWith({ access_token: 'fictional-permanent' })
  expect(sync).toHaveBeenCalledWith({
    access_token: 'fictional-permanent',
    cursor: 'previous',
    count: 500,
  })
  expect(remove).toHaveBeenCalledWith({ access_token: 'fictional-permanent' })
  expect(balance).not.toHaveBeenCalled()
  expect(refresh).not.toHaveBeenCalled()
})
it('never forwards provider response bodies, requests, secrets or unrecognized error codes', () => {
  const error = safeProviderError({
    response: { data: { error_code: 'SECRET_TOKEN_IN_ERROR', error_message: 'secret' } },
    config: { headers: { 'PLAID-SECRET': 'secret' } },
  })
  expect(error.code).toBe('PROVIDER_UNAVAILABLE')
  expect(String(error)).not.toContain('secret')
})
