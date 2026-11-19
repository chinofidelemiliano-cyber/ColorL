CREATE TABLE IF NOT EXISTS access_invitations (
 code_hash TEXT PRIMARY KEY,
 created_by INTEGER NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 used_by INTEGER REFERENCES users(id),
 used_at INTEGER
);
CREATE INDEX IF NOT EXISTS access_invitations_user ON access_invitations(used_by);
CREATE TABLE IF NOT EXISTS auth_attempts (
 address TEXT PRIMARY KEY,
 minute INTEGER NOT NULL,
 count INTEGER NOT NULL
);
