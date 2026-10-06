CREATE TABLE kiln_browser_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  account_epoch INTEGER NOT NULL CHECK (account_epoch > 0),
  authenticated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  idle_expires_at INTEGER NOT NULL DEFAULT 0,
  csrf TEXT NOT NULL
);

CREATE INDEX kiln_browser_sessions_by_account ON kiln_browser_sessions(account_id, authenticated_at);
CREATE INDEX kiln_browser_sessions_by_expiry ON kiln_browser_sessions(expires_at);
