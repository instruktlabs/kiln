CREATE TABLE kiln_account_actions (
  state_hash TEXT PRIMARY KEY NOT NULL,
  binding_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL REFERENCES kiln_browser_sessions(token_hash) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  account_epoch INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google','github')),
  purpose TEXT NOT NULL CHECK(purpose='disconnect'),
  target TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_account_actions_by_account ON kiln_account_actions(account_id);
CREATE INDEX kiln_account_actions_by_expiry ON kiln_account_actions(expires_at);
