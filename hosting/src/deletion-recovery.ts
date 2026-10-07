import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { D1AccountDeletions, type DeletionPorts } from './account-deletions';
import type { TenantEnv } from './gateway';
import { readBounded } from './http';
import { tenantForAccount } from './tenant-identity';

export function deletionPorts(
  env: TenantEnv & { ACCOUNTS: D1Database },
  origin: string,
  oauth: Pick<OAuthHelpers, 'listUserGrants' | 'revokeGrant'>,
): DeletionPorts {
  return {
    async retireCompute(accountId) {
      if (!env.NATIVE_COMPUTE) throw new Error('Compute retirement is not configured');
      await env.NATIVE_COMPUTE.retireTenant(await tenantForAccount(origin, accountId));
    },
    async retireStorage(accountId) {
      const tenant = await tenantForAccount(origin, accountId);
      const response = await env.TENANTS.getByName(tenant).fetch(
        'https://tenant.internal/internal/account-deletion',
        { method: 'POST' },
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Storage retirement failed');
      }
      const value: unknown = JSON.parse(
        new TextDecoder().decode(await readBounded(response.body, 1024)),
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid storage retirement response');
      const result = value as Record<string, unknown>;
      if (
        Object.keys(result).some(
          (key) => !['state', 'pendingWrites', 'remainingObjects'].includes(key),
        ) ||
        !['retiring', 'purged'].includes(String(result.state)) ||
        !Number.isSafeInteger(result.pendingWrites) ||
        Number(result.pendingWrites) < 0 ||
        !Number.isSafeInteger(result.remainingObjects) ||
        Number(result.remainingObjects) < 0
      )
        throw new Error('Invalid storage retirement response');
      if (
        result.state === 'purged' &&
        (result.pendingWrites !== 0 || result.remainingObjects !== 0)
      )
        throw new Error('Storage purge is unconfirmed');
      return result.state === 'purged';
    },
    async revokeGrants(accountId) {
      const database = env.ACCOUNTS.withSession('first-primary');
      const known = await database
        .prepare(
          'SELECT DISTINCT grant_id AS id FROM kiln_connections WHERE account_id=? AND grant_id IS NOT NULL LIMIT 4',
        )
        .bind(accountId)
        .all<{ id: string }>();
      const listed = await oauth.listUserGrants(accountId, { limit: 4 });
      if (listed.items.length > 4 || listed.items.some((grant) => grant.userId !== accountId))
        throw new Error('Invalid grant cleanup inventory');
      const ids = [
        ...new Set([...known.results.map((row) => row.id), ...listed.items.map((row) => row.id)]),
      ].slice(0, 4);
      for (const id of ids) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(id))
          throw new Error('Invalid grant cleanup identifier');
        await oauth.revokeGrant(id, accountId);
        await database
          .prepare('UPDATE kiln_connections SET grant_id=NULL WHERE account_id=? AND grant_id=?')
          .bind(accountId, id)
          .run();
      }
      // Empty eventually-consistent KV is not an immediate erasure guarantee.
      // Primary deletion already denies all old grants. Late/stale library records
      // retain their configured TTL; privacy documentation must say so.
      return ids.length === 0 && !listed.cursor;
    },
  };
}

export function recoverAccountDeletions(
  env: TenantEnv & { ACCOUNTS: D1Database },
  origin: string,
  oauth: OAuthHelpers,
) {
  return new D1AccountDeletions(env.ACCOUNTS, origin, deletionPorts(env, origin, oauth)).recover();
}
