CREATE TABLE kiln_consent_claims (
  handle_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_consent_expiry ON kiln_consent_claims(expires_at);

CREATE TABLE kiln_login_intents (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
  purpose TEXT NOT NULL CHECK(purpose = 'sign-in'),
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_login_expiry ON kiln_login_intents(expires_at);
