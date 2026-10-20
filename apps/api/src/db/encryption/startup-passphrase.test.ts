import { afterEach, expect, it, vi } from 'vitest'
import { startupPassphrase } from './startup-passphrase'
afterEach(() => vi.restoreAllMocks())
it('uses the exact environment passphrase without a terminal and removes it from the environment', async () => {
  const env = { DATABASE_PASSPHRASE: '  Fictional passphrase # with spaces  ' }
  const prompt = vi.fn()
  const key = await startupPassphrase(env, prompt)
  expect(key.toString()).toBe('  Fictional passphrase # with spaces  ')
  expect(env.DATABASE_PASSPHRASE).toBeUndefined()
  expect(prompt).not.toHaveBeenCalled()
  key.fill(0)
})
it.each([undefined, ''])(
  'keeps manual unlocking when the optional setting is %s',
  async (value) => {
    const prompt = vi.fn().mockResolvedValue(Buffer.from('Fictional manual passphrase'))
    const env = { DATABASE_PASSPHRASE: value }
    const key = await startupPassphrase(env, prompt)
    expect(prompt).toHaveBeenCalledOnce()
    expect(env.DATABASE_PASSPHRASE).toBeUndefined()
    key.fill(0)
  },
)
it.each(['short', 'x'.repeat(1025)])(
  'rejects invalid supplied keys without logging or falling back to a prompt',
  async (value) => {
    const prompt = vi.fn(),
      log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = { DATABASE_PASSPHRASE: value }
    await expect(startupPassphrase(env, prompt)).rejects.toThrow('16–1024 UTF-8 bytes')
    expect(prompt).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(env.DATABASE_PASSPHRASE).toBeUndefined()
  },
)
