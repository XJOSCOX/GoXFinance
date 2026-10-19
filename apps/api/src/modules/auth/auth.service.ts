import argon2 from 'argon2'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { loginSchema, signupSchema, type PublicUser } from '@goxfinance/shared'
import type { AuthRepository } from './auth.repository'

const SESSION_SECONDS = 7 * 24 * 60 * 60

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) { super(message) }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function authService(repository: AuthRepository) {
  function publicUser(user: { id: string; fullName: string; email: string }): PublicUser {
    return { id: user.id, fullName: user.fullName, email: user.email }
  }

  function createSession(userId: string) {
    const token = randomBytes(32).toString('hex')
    const now = Math.floor(Date.now() / 1000)
    repository.createSession({ id: randomUUID(), userId, tokenHash: hashToken(token), createdAt: new Date().toISOString(), expiresAt: now + SESSION_SECONDS })
    return token
  }

  return {
    async signup(input: unknown) {
      const values = signupSchema.parse(input)
      if (repository.findUserByEmail(values.email)) throw new AuthError('An account with this email already exists', 409)
      const now = new Date().toISOString()
      const user = { id: randomUUID(), fullName: values.fullName, email: values.email,
        passwordHash: await argon2.hash(values.password, { type: argon2.argon2id }), createdAt: now, updatedAt: now }
      try { repository.createUser(user) }
      catch { throw new AuthError('An account with this email already exists', 409) }
      return { user: publicUser(user), token: createSession(user.id) }
    },
    async login(input: unknown) {
      const values = loginSchema.parse(input)
      const user = repository.findUserByEmail(values.email)
      if (!user || !await argon2.verify(user.passwordHash, values.password)) {
        throw new AuthError('Invalid email or password', 401)
      }
      return { user: publicUser(user), token: createSession(user.id) }
    },
    currentUser(token: string | undefined) {
      if (!token) throw new AuthError('Sign in required', 401)
      const result = repository.findActiveSession(hashToken(token), Math.floor(Date.now() / 1000))
      if (!result) throw new AuthError('Sign in required', 401)
      return publicUser(result.user)
    },
    logout(token: string | undefined) {
      if (token) repository.deleteSession(hashToken(token))
    },
  }
}

export type AuthService = ReturnType<typeof authService>
