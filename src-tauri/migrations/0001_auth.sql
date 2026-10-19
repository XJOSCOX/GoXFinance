CREATE TABLE users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(length(full_name) BETWEEN 1 AND 120),
  CHECK(length(email) BETWEEN 3 AND 254),
  CHECK(length(password_hash) > 20)
);
CREATE UNIQUE INDEX idx_users_email ON users(email);
