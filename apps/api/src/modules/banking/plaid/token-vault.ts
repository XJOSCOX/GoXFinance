import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
/** Independent application key; never the SQLite passphrase. Ciphertext is bound to its household and connection. */
export function tokenVault(key: Buffer) {
  if (key.length !== 32) throw new Error('Invalid token encryption key')
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 32)
  return {
    keyId,
    seal(token: string, home: string, connection: string) {
      const nonce = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, nonce)
      cipher.setAAD(Buffer.from(JSON.stringify(['goxfinance-plaid-v1', home, connection])))
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
      return [
        'v1',
        nonce.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.')
    },
    open(value: string, storedKeyId: string, home: string, connection: string) {
      try {
        if (storedKeyId !== keyId) throw new Error()
        const [version, nonce, tag, encrypted, ...extra] = value.split('.')
        if (version !== 'v1' || extra.length || !nonce || !tag || !encrypted) throw new Error()
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'))
        decipher.setAAD(Buffer.from(JSON.stringify(['goxfinance-plaid-v1', home, connection])))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        return Buffer.concat([
          decipher.update(Buffer.from(encrypted, 'base64url')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        throw new Error('Bank token cannot be unlocked. Restore its original application key.')
      }
    },
    dispose() {
      key.fill(0)
    },
  }
}
export type TokenVault = ReturnType<typeof tokenVault>
