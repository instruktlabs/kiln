CREATE TABLE kiln_connections (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  account_epoch INTEGER NOT NULL CHECK(account_epoch > 0),
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_domain TEXT,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','revoked')),
  grant_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(account_id, grant_id)
);
CREATE INDEX kiln_connections_by_account ON kiln_connections(account_id, created_at);
CREATE INDEX kiln_connections_by_expiry ON kiln_connections(expires_at);
