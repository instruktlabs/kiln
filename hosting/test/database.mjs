import { readFile } from 'node:fs/promises';

export async function migrateAccounts(database) {
  for (const file of [
    '0001_accounts.sql',
    '0002_login_intents.sql',
    '0003_browser_sessions.sql',
    '0004_browser_logins.sql',
    '0005_connections.sql',
    '0006_account_actions.sql',
    '0007_browser_login_return.sql',
    '0008_identity_actions.sql',
    '0009_account_deletion.sql',
  ]) {
    const source = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    await database.batch(
      source
        .split(';')
        .filter((sql) => sql.trim())
        .map((sql) => database.prepare(sql)),
    );
  }
}
