import { and, eq, gt } from 'drizzle-orm'
import type { DatabaseConnection } from '../../db/connection'
import { sessions, users } from '../../../../../packages/db/src/schema'

export function authRepository(db: DatabaseConnection) {
  return {
    findUserByEmail: (email: string) => db.select().from(users).where(eq(users.email, email)).get(),
    findUserById: (id: string) => db.select().from(users).where(eq(users.id, id)).get(),
    createUser: (user: typeof users.$inferInsert) => db.insert(users).values(user).run(),
    createSession: (session: typeof sessions.$inferInsert) => db.insert(sessions).values(session).run(),
    findActiveSession: (tokenHash: string, now: number) => db.select({ user: users }).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now))).get(),
    deleteSession: (tokenHash: string) => db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run(),
  }
}

export type AuthRepository = ReturnType<typeof authRepository>
