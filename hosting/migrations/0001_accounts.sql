CREATE TABLE kiln_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled', 'deleting')),
  authorization_epoch INTEGER NOT NULL DEFAULT 1 CHECK (authorization_epoch > 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE kiln_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES kiln_accounts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (issuer, subject)
);

CREATE INDEX kiln_identities_by_account ON kiln_identities(account_id);
