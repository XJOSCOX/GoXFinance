import type Database from 'better-sqlite3'
import { createSnapshot, listSnapshots, queueRestore } from '../../db/sqlite-backups'
import { securityFor } from '../../db/encryption/sqlite-engine'

export function backupRepository(sqlite: Database.Database, databasePath: string) {
  return {
    mayControl(userId: string) {
      const ownership = sqlite
        .prepare(
          'SELECT COUNT(*) AS total, SUM(CASE WHEN created_by_user_id=? THEN 0 ELSE 1 END) AS foreign_count FROM households',
        )
        .get(userId) as { total: number; foreign_count: number }
      const others = sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM users WHERE id<>? AND NOT EXISTS (SELECT 1 FROM household_user_roles r WHERE r.user_id=users.id AND r.household_id IN (SELECT id FROM households WHERE created_by_user_id=?))',
        )
        .get(userId, userId) as { count: number }
      return ownership.total > 0 && ownership.foreign_count === 0 && others.count === 0
    },
    list(userId: string) {
      return listSnapshots(databasePath, userId)
    },
    create(userId: string) {
      return createSnapshot(sqlite, databasePath, userId, 'manual')
    },
    queue(backupId: string, userId: string) {
      return queueRestore(databasePath, backupId, userId, securityFor(sqlite))
    },
  }
}
