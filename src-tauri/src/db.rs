use rusqlite::Connection;
use std::{fs, path::Path};

pub const DATABASE_FILE: &str = "goxfinance_auth.sqlite";

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
        .map_err(|error| error.to_string())?;
    migrate(&mut connection)?;
    Ok(connection)
}

fn migrate(connection: &mut Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);").map_err(|error| error.to_string())?;
    let version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if version > 1 {
        return Err("This database was created by a newer GoXPlan version".into());
    }
    if version == 0 {
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(include_str!("../migrations/0001_auth.sql"))
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO schema_migrations (version,applied_at) VALUES (1,?1)",
                [chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn migration_is_repeatable_and_creates_only_auth_tables() {
        let path =
            std::env::temp_dir().join(format!("goxfinance-migration-{}.sqlite", Uuid::new_v4()));
        let first = open(&path).unwrap();
        let version: i64 = first
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, 1);
        drop(first);
        let second = open(&path).unwrap();
        let tables = second.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").unwrap()
            .query_map([], |row| row.get::<_, String>(0)).unwrap().collect::<Result<Vec<_>, _>>().unwrap();
        assert_eq!(tables, vec!["schema_migrations", "users"]);
        drop(second);
        fs::remove_file(path).unwrap();
    }
}
