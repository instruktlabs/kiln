-- One identity from each supported provider per Kiln account. Existing sign-in
-- registration creates one identity and never merges accounts.
CREATE UNIQUE INDEX kiln_identity_provider_by_account ON kiln_identities(account_id, issuer);

CREATE TABLE kiln_identity_actions (
  state_hash TEXT PRIMARY KEY NOT NULL,
  binding_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL REFERENCES kiln_browser_sessions(token_hash) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  account_epoch INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('link','unlink')),
  phase TEXT NOT NULL CHECK(phase IN ('confirm','target')),
  provider TEXT NOT NULL CHECK(provider IN ('google','github')),
  target TEXT NOT NULL CHECK(target IN ('google','github')),
  confirmer TEXT NOT NULL CHECK(confirmer IN ('google','github')),
  confirmed_subject TEXT,
  confirmed_at INTEGER,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_identity_actions_by_account ON kiln_identity_actions(account_id);
CREATE INDEX kiln_identity_actions_by_expiry ON kiln_identity_actions(expires_at);

CREATE TABLE kiln_account_events (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  kind TEXT NOT NULL CHECK(kind IN ('link','unlink')),
  provider TEXT NOT NULL CHECK(provider IN ('google','github')),
  created_at INTEGER NOT NULL
);
CREATE INDEX kiln_account_events_by_account ON kiln_account_events(account_id, created_at);
