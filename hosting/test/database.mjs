import { readFile } from 'node:fs/promises';

export async function migrateAccounts(database) {
  for (const file of ['0001_accounts.sql', '0002_login_intents.sql']) {
    const source = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    await database.batch(
      source
        .split(';')
        .filter((sql) => sql.trim())
        .map((sql) => database.prepare(sql)),
    );
  }
}
