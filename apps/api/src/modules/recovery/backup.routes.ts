import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { SESSION_COOKIE } from '../auth/auth.controller'
import { AuthError, type AuthService } from '../auth/auth.service'
import { backupRepository } from './backup.repository'

export function registerBackupRoutes(app: FastifyInstance, auth: AuthService, sqlite: Database.Database, databasePath: string) {
  const store = backupRepository(sqlite, databasePath)
  function requireOwner(token?: string) {
    const user = auth.currentUser(token)
    // A full database backup includes all users/households: a single household Owner is insufficient.
    if (!store.mayControl(user.id)) throw new AuthError('Database recovery is available only to the Owner of every household when all accounts belong to those households', 403)
    return user
  }
  const limit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.get('/api/backups', request => ({ backups: store.list(requireOwner(request.cookies[SESSION_COOKIE]).id)
    .map(({ id, createdAt }) => ({ id, createdAt })) }))
  app.post('/api/backups', limit, (request, reply) => {
    const user = requireOwner(request.cookies[SESSION_COOKIE])
    const snapshot = store.create(user.id)
    return reply.code(201).send({ backup: { id: snapshot.id, createdAt: snapshot.createdAt } })
  })
  app.post('/api/backups/:backupId/restore', limit, (request, reply) => {
    const user = requireOwner(request.cookies[SESSION_COOKIE])
    const { backupId } = z.object({ backupId: z.uuid() }).parse(request.params)
    z.object({ confirmation: z.literal('RESTORE DATABASE') }).strict().parse(request.body)
    try { store.queue(backupId, user.id) }
    catch { return reply.code(409).send({ code: 'RESTORE_REJECTED', error: 'Restore could not be queued. Check backup integrity or an existing queued restore.' }) }
    return reply.code(202).send({ restartRequired: true })
  })
}
