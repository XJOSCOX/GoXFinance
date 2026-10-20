import { sandboxGateway, type PlaidGateway } from './plaid.gateway'
import { tokenVault, type TokenVault } from './token-vault'
import { windowsTokenKey } from './windows-key'
export type PlaidRuntime =
  { gateway: PlaidGateway; vault: TokenVault; itemCap: number } | { disabledReason: string }
/** Never called by tests or the browser. Production remains disabled pending separate authorization and entitlement review. */
export async function localPlaidRuntime(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PlaidRuntime> {
  if (environment.PLAID_ENV && environment.PLAID_ENV !== 'sandbox')
    return {
      disabledReason:
        'Live Plaid is disabled. Confirm free Trial eligibility and obtain explicit authorization before activation.',
    }
  if (environment.PLAID_ENABLED !== 'true')
    return { disabledReason: 'Sandbox connectivity is off. Manual statements remain available.' }
  const clientId = environment.PLAID_CLIENT_ID,
    secret = environment.PLAID_SECRET
  if (!clientId || !secret)
    return { disabledReason: 'Sandbox credentials are not configured on the API.' }
  try {
    const key = await windowsTokenKey(),
      cap = Number(environment.PLAID_SANDBOX_ITEM_CAP ?? '10')
    if (!Number.isInteger(cap) || cap < 1 || cap > 10) {
      key.fill(0)
      return { disabledReason: 'Set a Sandbox Item cap between 1 and 10.' }
    }
    return { gateway: sandboxGateway(clientId, secret), vault: tokenVault(key), itemCap: cap }
  } catch {
    return {
      disabledReason:
        'Protected token-key storage is unavailable. Bank connections are disabled; manual imports still work.',
    }
  }
}
