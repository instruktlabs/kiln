CREATE TABLE kiln_browser_logins (
  state_hash TEXT PRIMARY KEY NOT NULL,
  binding_hash TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_browser_logins_by_expiry ON kiln_browser_logins(expires_at);
