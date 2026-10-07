import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let deletionPorts;
before(async () => {
  const output = new URL('../../.cache/hosted-deletion-recovery/ports.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/deletion-recovery.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ deletionPorts } = await import(output));
});
const account = `ka_${'a'.repeat(32)}`,
  origin = 'https://kiln.example.com';
const tenant = createHash('sha256')
  .update(JSON.stringify(['kiln-tenant-v1', origin, account]))
  .digest('base64url');

test('deletion binding derives tenancy outside compute and accepts only an exact, complete storage receipt', async () => {
  const calls = [];
  let response = { state: 'purged', pendingWrites: 0, remainingObjects: 0 };
  const env = {
    NATIVE_COMPUTE: { retireTenant: async (value) => calls.push(['compute', value]) },
    TENANTS: {
      getByName: (value) => ({
        async fetch(url, init) {
          calls.push(['storage', value, url, init]);
          return Response.json(response);
        },
      }),
    },
  };
  const ports = deletionPorts(env, origin, {});
  await ports.retireCompute(account);
  assert.equal(await ports.retireStorage(account), true);
  assert.deepEqual(calls, [
    ['compute', tenant],
    ['storage', tenant, 'https://tenant.internal/internal/account-deletion', { method: 'POST' }],
  ]);
  response = { state: 'retiring', pendingWrites: 1, remainingObjects: 1 };
  assert.equal(await ports.retireStorage(account), false);
  for (const invalid of [
    { state: 'purged', pendingWrites: 1, remainingObjects: 0 },
    { state: 'purged', pendingWrites: 0, remainingObjects: 1 },
    { state: 'purged', pendingWrites: 0 },
    { state: 'active', pendingWrites: 0, remainingObjects: 0 },
    { state: 'purged', pendingWrites: 0, remainingObjects: 0, tenant: 'other' },
    'x'.repeat(2048),
  ]) {
    response = invalid;
    await assert.rejects(ports.retireStorage(account));
  }
  await assert.rejects(ports.retireStorage('invalid-account'));
  await assert.rejects(deletionPorts({ TENANTS: env.TENANTS }, origin, {}).retireCompute(account));
});

test('grant cleanup is bounded to the deleting owner and persists progress only after revocation', async () => {
  const revoked = [],
    cleared = [];
  let known = ['known-grant'],
    listed = [{ id: 'orphan-grant', userId: account }];
  const env = {
    ACCOUNTS: {
      withSession(mode) {
        assert.equal(mode, 'first-primary');
        return {
          prepare(sql) {
            return {
              bind(...args) {
                assert.equal(args[0], account);
                return {
                  all: async () => {
                    assert.match(sql, /LIMIT 4/);
                    return { results: known.map((id) => ({ id })) };
                  },
                  run: async () => {
                    cleared.push(args);
                    known = known.filter((id) => id !== args[1]);
                  },
                };
              },
            };
          },
        };
      },
    },
  };
  const oauth = {
    listUserGrants: async (user, options) => {
      assert.equal(user, account);
      assert.deepEqual(options, { limit: 4 });
      return { items: listed };
    },
    revokeGrant: async (id, user) => {
      revoked.push([id, user]);
      listed = listed.filter((row) => row.id !== id);
    },
  };
  const ports = deletionPorts(env, origin, oauth);
  assert.equal(await ports.revokeGrants(account), false);
  assert.deepEqual(revoked, [
    ['known-grant', account],
    ['orphan-grant', account],
  ]);
  assert.equal(cleared.length, 2);
  assert.equal(await ports.revokeGrants(account), true);
  listed = [{ id: 'foreign', userId: 'other' }];
  await assert.rejects(ports.revokeGrants(account));
  assert.equal(revoked.length, 2);
  listed = [];
  known = ['failed-grant'];
  oauth.revokeGrant = async () => {
    throw new Error('Injected revocation failure');
  };
  await assert.rejects(ports.revokeGrants(account));
  assert.deepEqual(known, ['failed-grant']);
});
