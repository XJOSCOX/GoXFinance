import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
export type ProviderAccount = {
  id: string
  name: string
  type: string
  subtype: string | null
  mask: string | null
  current: number | null
  available: number | null
  currency: string | null
}
export type ProviderTransaction = {
  id: string
  accountId: string
  pendingId: string | null
  date: string
  authorizedDate: string | null
  amount: number
  currency: string | null
  pending: boolean
  merchant: string | null
  description: string
}
export type SyncPage = {
  added: ProviderTransaction[]
  modified: ProviderTransaction[]
  removed: string[]
  cursor: string
  more: boolean
}
export interface PlaidGateway {
  link(user: string, accessToken?: string): Promise<{ token: string; expiresAt: string }>
  exchange(publicToken: string): Promise<{ token: string; itemId: string }>
  accounts(
    accessToken: string,
  ): Promise<{ accounts: ProviderAccount[]; institutionId: string | null }>
  sync(accessToken: string, cursor: string | null): Promise<SyncPage>
  remove(accessToken: string): Promise<void>
}
export class ProviderError extends Error {
  constructor(readonly code: string) {
    super('Bank provider request failed')
  }
}
const allowedErrors = new Set([
  'ITEM_LOGIN_REQUIRED',
  'ITEM_NOT_SUPPORTED',
  'INVALID_ACCESS_TOKEN',
  'INSTITUTION_DOWN',
  'INSTITUTION_NOT_RESPONDING',
  'RATE_LIMIT_EXCEEDED',
  'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
  'PRODUCT_NOT_READY',
  'INTERNAL_SERVER_ERROR',
])
export function safeProviderError(error: unknown) {
  if (error instanceof ProviderError) return error
  const code = (error as { response?: { data?: { error_code?: unknown } } })?.response?.data
    ?.error_code
  return new ProviderError(
    typeof code === 'string' && allowedErrors.has(code) ? code : 'PROVIDER_UNAVAILABLE',
  )
}
/** Sandbox only. No production base path, optional products, Balance, Refresh, payment or webhook calls. */
export function sandboxGateway(clientId: string, secret: string): PlaidGateway {
  const api = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret },
        timeout: 20000,
      },
    }),
  )
  async function call<T>(work: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await work()).data
    } catch (e) {
      throw safeProviderError(e)
    }
  }
  return {
    async link(user, accessToken) {
      const r = await call(() =>
        api.linkTokenCreate({
          user: { client_user_id: user },
          client_name: 'GoXFinance',
          language: 'en',
          country_codes: [CountryCode.Us],
          ...(accessToken ? { access_token: accessToken } : { products: [Products.Transactions] }),
        }),
      )
      return { token: r.link_token, expiresAt: r.expiration }
    },
    async exchange(publicToken) {
      const r = await call(() => api.itemPublicTokenExchange({ public_token: publicToken }))
      return { token: r.access_token, itemId: r.item_id }
    },
    async accounts(accessToken) {
      const r = await call(() => api.accountsGet({ access_token: accessToken }))
      return {
        institutionId: r.item.institution_id ?? null,
        accounts: r.accounts.map((a) => ({
          id: a.account_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
          current: a.balances.current,
          available: a.balances.available,
          currency: a.balances.iso_currency_code,
        })),
      }
    },
    async sync(accessToken, cursor) {
      const r = await call(() =>
          api.transactionsSync({
            access_token: accessToken,
            ...(cursor ? { cursor } : {}),
            count: 500,
          }),
        ),
        map = (t: (typeof r.added)[number]): ProviderTransaction => ({
          id: t.transaction_id,
          accountId: t.account_id,
          pendingId: t.pending_transaction_id,
          date: t.date,
          authorizedDate: t.authorized_date ?? null,
          amount: t.amount,
          currency: t.iso_currency_code,
          pending: t.pending,
          merchant: t.merchant_name ?? null,
          description: t.name,
        })
      return {
        added: r.added.map(map),
        modified: r.modified.map(map),
        removed: r.removed.map((t) => t.transaction_id),
        cursor: r.next_cursor,
        more: r.has_more,
      }
    },
    async remove(accessToken) {
      await call(() => api.itemRemove({ access_token: accessToken }))
    },
  }
}
