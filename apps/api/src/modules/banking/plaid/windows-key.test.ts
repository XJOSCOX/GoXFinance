import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { windowsTokenKey } from './windows-key'
it.skipIf(process.platform !== 'win32')(
  'persists an independently DPAPI-wrapped key and refuses corruption without replacing it',
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'gox-bank-key-'))
    let first: Buffer | undefined, second: Buffer | undefined
    try {
      first = await windowsTokenKey(folder)
      second = await windowsTokenKey(folder)
      expect(first).toHaveLength(32)
      expect(second.equals(first)).toBe(true)
      const path = join(folder, 'plaid-token-key.dpapi'),
        wrapped = await readFile(path)
      expect(wrapped.equals(first)).toBe(false)
      await writeFile(path, Buffer.from('fictional corrupt wrapped key'))
      await expect(windowsTokenKey(folder)).rejects.toThrow('unavailable')
      expect(await readFile(path, 'utf8')).toBe('fictional corrupt wrapped key')
    } finally {
      first?.fill(0)
      second?.fill(0)
      await rm(folder, { recursive: true, force: true })
    }
  },
  30000,
)
