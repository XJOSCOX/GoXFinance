use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::Manager;
use rusqlite::{Connection, DatabaseName, OpenFlags, params, params_from_iter, types::Value};
use serde::Deserialize;
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

const DATABASE_URL: &str = "sqlite:goxplan.sqlite";
const TABLES: &[&str] = &["households", "household_members", "categories", "bank_accounts", "income_sources", "income_transactions", "expenses", "expense_transactions", "debts", "settlement_offers", "debt_payments", "settlement_payments", "savings_goals", "trading_accounts", "trading_transactions", "monthly_budgets", "bank_transfers", "saved_scenarios", "balance_corrections", "income_transaction_revisions", "application_settings"];

#[derive(Deserialize)]
struct SqlStatement { sql: String, params: Vec<serde_json::Value> }
fn to_sql_value(value: serde_json::Value) -> Result<Value, String> {
    match value {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Bool(b) => Ok(Value::Integer(i64::from(b))),
        serde_json::Value::String(s) => Ok(Value::Text(s)),
        serde_json::Value::Number(n) => n.as_i64().map(Value::Integer).or_else(|| n.as_f64().map(Value::Real)).ok_or_else(|| "Unsupported number".into()),
        _ => Err("Only scalar SQL parameters are allowed".into()),
    }
}

fn apply_on_connection(connection: &mut Connection, statements: Vec<SqlStatement>) -> Result<(), String> {
    connection.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    for statement in statements {
        let sql = statement.sql.trim_start().to_ascii_uppercase();
        if !["INSERT ", "UPDATE ", "DELETE "].iter().any(|prefix| sql.starts_with(prefix)) { return Err("Only data changes are allowed".into()); }
        let params = statement.params.into_iter().map(to_sql_value).collect::<Result<Vec<_>, _>>()?;
        tx.execute(&statement.sql, params_from_iter(params)).map_err(|e| e.to_string())?;
    }
    let invalid: i64 = tx.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if invalid != 0 { return Err("Foreign-key validation failed; transaction rolled back".into()); }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn apply_finance_batch(app: tauri::AppHandle, statements: Vec<SqlStatement>) -> Result<(), String> {
    let mut connection = Connection::open(database_path(&app)?).map_err(|e| e.to_string())?;
    apply_on_connection(&mut connection, statements)
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("goxplan.sqlite"))
}
fn backup_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?.join("backups");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}
fn backup_name(name: &str) -> Result<(), String> {
    if name.starts_with("goxplan-") && name.ends_with(".sqlite") && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.') { Ok(()) } else { Err("Invalid backup name".into()) }
}

#[tauri::command]
fn create_database_backup(app: tauri::AppHandle) -> Result<String, String> {
    let source = Connection::open(database_path(&app)?).map_err(|e| e.to_string())?;
    let milliseconds = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let name = format!("goxplan-{milliseconds}.sqlite");
    let destination = backup_directory(&app)?.join(&name);
    source.backup(DatabaseName::Main, &destination, None).map_err(|e| e.to_string())?;
    let copy = Connection::open_with_flags(&destination, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
    let integrity: String = copy.query_row("PRAGMA integrity_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if integrity != "ok" { return Err("Backup integrity check failed".into()); }
    Ok(name)
}

#[tauri::command]
fn list_database_backups(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(backup_directory(&app)?).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() { if backup_name(name).is_ok() { names.push(name.to_owned()); } }
    }
    names.sort(); names.reverse(); Ok(names)
}

#[tauri::command]
fn merge_database_backup(app: tauri::AppHandle, name: String) -> Result<String, String> {
    backup_name(&name)?;
    let backup = backup_directory(&app)?.join(&name);
    let source = Connection::open_with_flags(&backup, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
    let integrity: String = source.query_row("PRAGMA integrity_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if integrity != "ok" { return Err("Backup integrity check failed".into()); }
    let version: i64 = source.query_row("SELECT max(version) FROM app_schema_versions", [], |row| row.get(0)).map_err(|_| "Unsupported backup schema".to_string())?;
    if !(1..=3).contains(&version) { return Err("Unsupported backup schema".into()); }
    drop(source);
    let mut destination = Connection::open(database_path(&app)?).map_err(|e| e.to_string())?;
    destination.execute("ATTACH DATABASE ?1 AS source", params![backup.to_string_lossy().to_string()]).map_err(|e| e.to_string())?;
    destination.execute_batch("PRAGMA foreign_keys=OFF;").map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let tx = destination.transaction().map_err(|e| e.to_string())?;
        for table in TABLES {
            let exists: i64 = tx.query_row("SELECT count(*) FROM source.sqlite_master WHERE type='table' AND name=?1", [table], |row| row.get(0)).map_err(|e| e.to_string())?;
            if exists == 0 { continue; }
            let mut source_columns = tx.prepare(&format!("PRAGMA source.table_info({table})")).map_err(|e| e.to_string())?;
            let source_names = source_columns.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
            drop(source_columns);
            let mut target_columns = tx.prepare(&format!("PRAGMA main.table_info({table})")).map_err(|e| e.to_string())?;
            let target_names = target_columns.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
            drop(target_columns);
            let columns = source_names.into_iter().filter(|column| target_names.contains(column)).collect::<Vec<_>>().join(", ");
            tx.execute(&format!("INSERT OR IGNORE INTO main.{table} ({columns}) SELECT {columns} FROM source.{table}"), []).map_err(|e| e.to_string())?;
            let missing: i64 = tx.query_row(&format!("SELECT count(*) FROM source.{table} s LEFT JOIN main.{table} m ON m.id=s.id WHERE m.id IS NULL"), [], |row| row.get(0)).map_err(|e| e.to_string())?;
            if missing != 0 { return Err(format!("Verification failed for {table}")); }
        }
        let invalid: i64 = tx.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        if invalid != 0 { return Err("Foreign-key validation failed; no changes were saved".into()); }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })();
    destination.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| e.to_string())?;
    destination.execute_batch("DETACH DATABASE source;").map_err(|e| e.to_string())?;
    result?;
    Ok("Backup merged by UUID and verified. Existing records were preserved.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_normalized_household_schema",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }, Migration { version: 2, description: "reconciliation_and_saved_scenarios", sql: include_str!("../migrations/0002_reconciliation.sql"), kind: MigrationKind::Up },
    Migration { version: 3, description: "variable_paychecks_and_history", sql: include_str!("../migrations/0003_variable_paychecks.sql"), kind: MigrationKind::Up }];
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().add_migrations(DATABASE_URL, migrations).build())
        .invoke_handler(tauri::generate_handler![create_database_backup, list_database_backups, merge_database_backup, apply_finance_batch])
        .run(tauri::generate_context!())
        .expect("failed to start GoXPlan");
}
