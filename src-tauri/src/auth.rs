use crate::db;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    pub id: String,
    pub full_name: String,
    pub email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub token: String,
    pub user: PublicUser,
}

struct Session {
    user_id: String,
    expires_at: u64,
}

pub struct AuthService {
    path: PathBuf,
    sessions: Mutex<HashMap<String, Session>>,
}

fn now_seconds() -> Result<u64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs())
}

fn hasher() -> Argon2<'static> {
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default())
}

fn normalize_email(email: &str) -> Result<String, String> {
    let normalized = email.trim().to_lowercase();
    let mut parts = normalized.split('@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    if local.is_empty()
        || !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
        || parts.next().is_some()
        || normalized.len() > 254
        || normalized.chars().any(char::is_whitespace)
    {
        return Err("Enter a valid email address".into());
    }
    Ok(normalized)
}

impl AuthService {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        db::open(&path)?;
        Ok(Self {
            path,
            sessions: Mutex::new(HashMap::new()),
        })
    }

    fn start_session(&self, user: PublicUser) -> Result<AuthSession, String> {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        let expires_at = now_seconds()? + 12 * 60 * 60;
        self.sessions
            .lock()
            .map_err(|_| "Session unavailable".to_string())?
            .insert(
                token.clone(),
                Session {
                    user_id: user.id.clone(),
                    expires_at,
                },
            );
        Ok(AuthSession { token, user })
    }

    pub fn signup(
        &self,
        full_name: &str,
        email: &str,
        password: &str,
    ) -> Result<AuthSession, String> {
        let full_name = full_name.trim();
        if full_name.is_empty() || full_name.len() > 120 {
            return Err("Enter a name of 1 to 120 characters".into());
        }
        let email = normalize_email(email)?;
        if password.chars().count() < 12 || password.chars().count() > 128 {
            return Err("Use a password between 12 and 128 characters".into());
        }
        let salt = SaltString::generate(&mut OsRng);
        let password_hash = hasher()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|_| "Unable to secure password".to_string())?
            .to_string();
        let id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let connection = db::open(&self.path)?;
        match connection.execute("INSERT INTO users (id,full_name,email,password_hash,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)", params![id, full_name, email, password_hash, timestamp, timestamp]) {
            Ok(_) => self.start_session(PublicUser { id, full_name: full_name.into(), email }),
            Err(rusqlite::Error::SqliteFailure(error, _)) if error.code == rusqlite::ErrorCode::ConstraintViolation => Err("An account with this email already exists".into()),
            Err(_) => Err("Unable to create account".into()),
        }
    }

    pub fn login(&self, email: &str, password: &str) -> Result<AuthSession, String> {
        let email = normalize_email(email)?;
        let connection = db::open(&self.path)?;
        let result = connection
            .query_row(
                "SELECT id,full_name,email,password_hash FROM users WHERE email=?1",
                [email],
                |row| {
                    Ok((
                        PublicUser {
                            id: row.get(0)?,
                            full_name: row.get(1)?,
                            email: row.get(2)?,
                        },
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| "Unable to sign in".to_string())?;
        let (user, stored_hash) = result.ok_or_else(|| "Invalid email or password".to_string())?;
        let parsed =
            PasswordHash::new(&stored_hash).map_err(|_| "Unable to verify password".to_string())?;
        hasher()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| "Invalid email or password".to_string())?;
        self.start_session(user)
    }

    pub fn current_user(&self, token: &str) -> Result<PublicUser, String> {
        let user_id = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "Session unavailable".to_string())?;
            let session = sessions
                .get(token)
                .ok_or_else(|| "Sign in required".to_string())?;
            if session.expires_at <= now_seconds()? {
                sessions.remove(token);
                return Err("Session expired. Sign in again.".into());
            }
            session.user_id.clone()
        };
        let connection = db::open(&self.path)?;
        connection
            .query_row(
                "SELECT id,full_name,email FROM users WHERE id=?1",
                [user_id],
                |row| {
                    Ok(PublicUser {
                        id: row.get(0)?,
                        full_name: row.get(1)?,
                        email: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|_| "Unable to load account".to_string())?
            .ok_or_else(|| "Sign in required".into())
    }

    pub fn logout(&self, token: &str) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "Session unavailable".to_string())?
            .remove(token);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!("goxfinance-auth-test-{}.sqlite", Uuid::new_v4()))
    }

    #[test]
    fn signup_login_hashing_duplicate_logout_and_isolation() {
        let path = test_path();
        let auth = AuthService::new(path.clone()).unwrap();
        let alice = auth
            .signup(
                "Alice Example",
                " Alice@Example.COM ",
                "correct horse battery",
            )
            .unwrap();
        assert_eq!(alice.user.email, "alice@example.com");
        let connection = db::open(&path).unwrap();
        let stored: String = connection
            .query_row(
                "SELECT password_hash FROM users WHERE id=?1",
                [&alice.user.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.starts_with("$argon2id$"));
        assert!(!stored.contains("correct horse battery"));
        assert!(auth
            .signup("Another", "ALICE@example.com", "another strong password")
            .is_err());
        assert!(auth
            .login("alice@example.com", "incorrect password")
            .is_err());
        let login = auth
            .login("ALICE@example.com", "correct horse battery")
            .unwrap();
        let bob = auth
            .signup("Bob", "bob@example.com", "another strong password")
            .unwrap();
        assert_eq!(auth.current_user(&login.token).unwrap().id, alice.user.id);
        assert_eq!(auth.current_user(&bob.token).unwrap().id, bob.user.id);
        auth.logout(&login.token).unwrap();
        assert!(auth.current_user(&login.token).is_err());
        assert_eq!(auth.current_user(&bob.token).unwrap().id, bob.user.id);
        drop(connection);
        drop(auth);
        let restarted = AuthService::new(path.clone()).unwrap();
        assert!(restarted.current_user(&bob.token).is_err());
        assert_eq!(
            restarted
                .login("alice@example.com", "correct horse battery")
                .unwrap()
                .user
                .id,
            alice.user.id
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn equal_passwords_get_distinct_salts_and_unknown_sessions_are_rejected() {
        let path = test_path();
        let auth = AuthService::new(path.clone()).unwrap();
        auth.signup("First", "first@example.com", "same long password")
            .unwrap();
        auth.signup("Second", "second@example.com", "same long password")
            .unwrap();
        let connection = db::open(&path).unwrap();
        let hashes = connection
            .prepare("SELECT password_hash FROM users ORDER BY email")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_ne!(hashes[0], hashes[1]);
        assert!(auth.current_user("unknown-session").is_err());
        drop(connection);
        drop(auth);
        fs::remove_file(path).unwrap();
    }
}
