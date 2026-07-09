DROP TABLE IF EXISTS app_metadata;
DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);

CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  issued_to TEXT NOT NULL,
  common_name TEXT NOT NULL,
  validity_days INTEGER NOT NULL,
  certificate_pem TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  fingerprint_sha256 TEXT,
  serial_number TEXT,
  created_at TEXT NOT NULL,
  expiry_notifications_sent TEXT,
  FOREIGN KEY (issued_to) REFERENCES users (email)
);

CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
