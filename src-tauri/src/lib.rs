mod auth;
mod db;

use auth::{AuthService, AuthSession, PublicUser};
use tauri::{Manager, State};

#[tauri::command]
fn signup(
    service: State<'_, AuthService>,
    full_name: String,
    email: String,
    password: String,
) -> Result<AuthSession, String> {
    service.signup(&full_name, &email, &password)
}

#[tauri::command]
fn login(
    service: State<'_, AuthService>,
    email: String,
    password: String,
) -> Result<AuthSession, String> {
    service.login(&email, &password)
}

#[tauri::command]
fn current_user(service: State<'_, AuthService>, token: String) -> Result<PublicUser, String> {
    service.current_user(&token)
}

#[tauri::command]
fn logout(service: State<'_, AuthService>, token: String) -> Result<(), String> {
    service.logout(&token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join(db::DATABASE_FILE);
            let service = AuthService::new(path).map_err(std::io::Error::other)?;
            app.manage(service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            signup,
            login,
            current_user,
            logout
        ])
        .run(tauri::generate_context!())
        .expect("failed to start GoXPlan");
}
