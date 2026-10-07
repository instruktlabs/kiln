import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let runtime, observer;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../probe/operations-tenant.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'storage',
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          r2Buckets: ['ARTIFACTS'],
          durableObjects: { TENANTS: { className: 'KilnOperationsTenant', useSQLite: true } },
          bindings: {
            STORAGE_MAX_BYTES: '1048576',
            STORAGE_MAX_OBJECTS: '32',
            STORAGE_MAX_GROUPS: '8',
            OPERATIONS_MODE: 'isolated-storage-v1',
          },
          outboundService: () => {
            throw new Error('Unexpected network');
          },
        },
        {
          name: 'observer',
          modules: true,
          compatibilityDate: '2026-10-06',
          durableObjects: {
            TENANTS: { className: 'KilnOperationsTenant', scriptName: 'storage', useSQLite: true },
          },
          script: `export default { async fetch(request, env) {
      const u = new URL(request.url), tenant = env.TENANTS.getByName(u.searchParams.get('tenant') || 'retention');
      try {
        if(u.pathname === '/prepare') return Response.json(await tenant.prepareRetention());
        if(u.pathname === '/status') return Response.json(await tenant.retentionStatus());
        if(u.pathname === '/remove') return Response.json(await tenant.removeRetainedSource());
        if(u.pathname === '/retire') return tenant.fetch('https://tenant.internal/internal/account-deletion', {method:'POST'});
        return tenant.fetch('https://tenant.internal/internal/programs', {method:'POST', body:'occupied', headers:{'content-type':'application/javascript'}});
      } catch { return new Response('Probe refused', {status:409}); }
    } }`,
        },
      ],
    }),
  );
  observer = await runtime.getWorker('observer');
});
after(async () => runtime?.dispose());
const send = (path) => observer.fetch(`https://fixture.internal${path}`);

test('private retention fixture proves seven-day expiry, then actual alarm cleanup preserves saved source', async () => {
  const prepared = await (await send('/prepare')).json();
  assert.equal(prepared.sevenDayExpiryVerified, true);
  assert.equal(prepared.expiredUnsavedDenied, true);
  assert.equal(prepared.savedSourceReadable, true);
  assert.equal(prepared.remainingObjects, 2);
  assert.equal(prepared.alarmObserved, false);
  // This awaits the local provider alarm, never calls alarm() or maintenance itself.
  // The deployed run must independently observe its real Cloudflare alarm.
  const deadline = Date.now() + 12000;
  let status;
  do {
    status = await (await send('/status')).json();
    if (status.alarmObserved) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(status.alarmObserved, true);
  assert.equal(status.remainingObjects, 1);
  assert.equal(status.unsavedObjectAbsent, true);
  assert.equal(status.savedObjectPresent, true);
  assert.equal(status.savedSourceReadable, true);
  assert.equal(status.expiredUnsavedDenied, true);
  assert.equal((await send('/prepare')).status, 409);
  const removed = await (await send('/remove')).json();
  assert.equal(removed.remainingObjects, 0);
  assert.equal(removed.savedObjectPresent, false);
  assert.equal(removed.savedSourceReadable, false);
});

test('fixture refuses existing or retired tenant data and refuses premature saved removal', async () => {
  assert.equal((await send('/occupy?tenant=occupied')).status, 201);
  assert.equal((await send('/prepare?tenant=occupied')).status, 409);
  assert.equal((await send('/retire?tenant=retired')).status, 200);
  assert.equal((await send('/prepare?tenant=retired')).status, 409);
  assert.equal((await send('/remove?tenant=unused')).status, 409);
  assert.equal((await send('/status?tenant=unused')).status, 409);
});
