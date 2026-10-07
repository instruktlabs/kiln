CREATE TABLE kiln_deletion_actions (
  state_hash TEXT PRIMARY KEY NOT NULL,
  binding_hash TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL REFERENCES kiln_browser_sessions(token_hash) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  account_epoch INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google','github')),
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX kiln_deletion_actions_by_account ON kiln_deletion_actions(account_id);
CREATE INDEX kiln_deletion_actions_by_expiry ON kiln_deletion_actions(expires_at);

-- The row and primary access revocation are created in one transaction. Completed
-- receipts retain no account/identity mapping and are pruned after seven days.
CREATE TABLE kiln_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT UNIQUE REFERENCES kiln_accounts(id) ON DELETE SET NULL,
  receipt_hash TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK(phase IN ('compute','storage','grants','identity','complete')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  retry_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER
);
CREATE INDEX kiln_deletions_by_retry ON kiln_deletions(phase,retry_at,lease_until);
CREATE INDEX kiln_deletions_by_expiry ON kiln_deletions(completed_at);
