import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { tokenVault } from './token-vault'
import { localPlaidRuntime } from './plaid.runtime'
it('binds authenticated ciphertext to its household, connection, version and independent key', () => {
  const first = tokenVault(randomBytes(32)),
    wrong = tokenVault(randomBytes(32))
  try {
    const cipher = first.seal('fictional-access-token', 'home-a', 'connection-a')
    expect(cipher).not.toContain('fictional-access-token')
    expect(first.seal('fictional-access-token', 'home-a', 'connection-a')).not.toBe(cipher)
    expect(first.open(cipher, first.keyId, 'home-a', 'connection-a')).toBe('fictional-access-token')
    for (const [vault, keyId, home, connection, value] of [
      [wrong, first.keyId, 'home-a', 'connection-a', cipher],
      [first, first.keyId, 'home-b', 'connection-a', cipher],
      [first, first.keyId, 'home-a', 'connection-b', cipher],
      [first, first.keyId, 'home-a', 'connection-a', cipher.replace('v1', 'v2')],
    ] as const)
      expect(() => vault.open(value, keyId, home, connection)).toThrow('cannot be unlocked')
    const parts = cipher.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => first.open(parts.join('.'), first.keyId, 'home-a', 'connection-a')).toThrow(
      'cannot be unlocked',
    )
  } finally {
    first.dispose()
    wrong.dispose()
  }
})
it('disables connectivity without credentials or when production is requested', async () => {
  expect(await localPlaidRuntime({})).toHaveProperty('disabledReason')
  expect(await localPlaidRuntime({ PLAID_ENABLED: 'true' })).toHaveProperty('disabledReason')
  expect(
    await localPlaidRuntime({
      PLAID_ENABLED: 'true',
      PLAID_ENV: 'production',
      PLAID_CLIENT_ID: 'fictional',
      PLAID_SECRET: 'fictional',
    }),
  ).toEqual({ disabledReason: expect.stringContaining('Live Plaid is disabled') })
})
