import type { PlaidGateway, SyncPage } from './plaid.gateway'
import { safeProviderError } from './plaid.gateway'
/** Any retry starts at the persisted cursor, with no partial database writes. */
export async function collectSync(gateway: PlaidGateway, token: string, original: string | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pages: SyncPage[] = []
    let cursor = original,
      count = 0
    try {
      for (let n = 0; n < 200; n++) {
        const page = await gateway.sync(token, cursor)
        count += page.added.length + page.modified.length + page.removed.length
        if (
          count > 100000 ||
          typeof page.cursor !== 'string' ||
          !page.cursor ||
          (page.more && page.cursor === cursor)
        )
          throw new Error('Invalid provider pagination')
        pages.push(page)
        cursor = page.cursor
        if (!page.more) return { pages, cursor }
      }
      throw new Error('Provider pagination limit exceeded')
    } catch (e) {
      const error = safeProviderError(e)
      if (
        attempt === 2 ||
        ![
          'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
          'RATE_LIMIT_EXCEEDED',
          'INTERNAL_SERVER_ERROR',
        ].includes(error.code)
      )
        throw error
      if (error.code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION')
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 200))
    }
  }
  throw new Error('Provider sync unavailable')
}
