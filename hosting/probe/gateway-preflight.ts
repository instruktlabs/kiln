import type { KilnCompute, KilnComputeControl } from '../src/admission-worker';
import { D1BrowserSessions } from '../src/browser-sessions';
import { D1Connections } from '../src/connections';
import { tenantForAccount } from '../src/tenant-identity';
import { readBounded } from '../src/http';
import {
  assertQualification,
  privateJson,
  qualificationOrigin,
  syntheticAccount,
  type QualificationAccountsEnv,
} from './qualification-accounts';

export interface PreflightEnv extends QualificationAccountsEnv {
  TENANTS: DurableObjectNamespace;
  ARTIFACTS: R2Bucket;
  COMPUTE: Service<KilnCompute>;
  CONTROL: Service<KilnComputeControl>;
}
interface PreflightReceipt {
  state: 'running' | 'finished';
  passed: boolean;
  computePaused: boolean;
  results: { name: string; passed: boolean }[];
}
const check = (value: unknown) => {
  if (!value) throw new Error('PRIVATE_PREFLIGHT_CHECK');
};
const source = 'function build(){return createRoot("Private gateway fixture");}';
const bytes = new TextEncoder().encode(source);
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
async function discard(response: Response, expected: number) {
  const status = response.status;
  await response.body?.cancel();
  check(status === expected);
}

/** One-use, no-VM stage for the next private full-stack trial. Synthetic identity
 * creation and direct storage seeding are intentionally not evidence of live login
 * or engine save. Native admission stays paused throughout and after this stage.
 */
export async function runGatewayPreflight(
  storage: DurableObjectStorage,
  env: PreflightEnv,
): Promise<PreflightReceipt> {
  const record: PreflightReceipt = {
    state: 'running',
    passed: false,
    computePaused: false,
    results: [],
  };
  const claimed = await storage.transaction(async (tx) => {
    if (await tx.get('gateway-preflight')) return false;
    await tx.put('gateway-preflight', record);
    return true;
  });
  if (!claimed) return (await storage.get<PreflightReceipt>('gateway-preflight'))!;
  let touchedCompute = false;
  const step = async (name: string, action: () => Promise<void>) => {
    const result = { name, passed: false };
    record.results.push(result);
    try {
      await action();
      result.passed = true;
    } finally {
      await storage.put('gateway-preflight', record);
    }
  };
  const send = (path: string, init?: RequestInit) =>
    env.GATEWAY.fetch(new Request(`${qualificationOrigin}${path}`, init));
  try {
    assertQualification(env);
    await step('fresh-resources', async () => {
      const accounts = await env.ACCOUNTS.withSession('first-primary')
        .prepare('SELECT COUNT(*) AS n FROM kiln_accounts')
        .first<{ n: number }>();
      check(accounts?.n === 0);
      check((await env.OAUTH_KV.list({ limit: 1 })).keys.length === 0);
      check((await env.ARTIFACTS.list({ limit: 1 })).objects.length === 0);
    });
    await step('pause-native', async () => {
      touchedCompute = true;
      await env.CONTROL.setPaused(true);
      const status = await env.COMPUTE.health();
      check(status.paused && status.activeRequests === 0 && status.pendingCleanup === 0);
      record.computePaused = true;
    });
    await step('metadata', async () => {
      const metadata = await privateJson(await send('/.well-known/oauth-protected-resource/mcp'));
      check(metadata.resource === `${qualificationOrigin}/mcp`);
    });
    let alice!: Awaited<ReturnType<typeof syntheticAccount>>, bob!: typeof alice;
    await step('synthetic-accounts', async () => {
      alice = await syntheticAccount(env, 'alice');
      bob = await syntheticAccount(env, 'bob');
      check(alice.account.id !== bob.account.id);
    });
    await step('anonymous-denied', async () => {
      await discard(await send('/mcp'), 401);
    });
    const bearer = (account: typeof alice) => ({ authorization: `Bearer ${account.accessToken}` });
    const discover = (account: typeof alice) =>
      send('/mcp', {
        method: 'POST',
        headers: {
          ...bearer(account),
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': {
                name: 'kiln-private-preflight',
                version: '1',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      });
    await step('edge-discovery', async () => {
      const response = await privateJson(await discover(alice));
      const result = response.result as { tools?: { name?: string }[] } | undefined;
      check(result?.tools?.some((tool) => tool.name === 'kiln_render'));
    });
    await step('oversized-denied', async () => {
      await discard(
        await send('/mcp', {
          method: 'POST',
          headers: { ...bearer(alice), 'content-type': 'application/json' },
          body: 'x'.repeat(1024 * 1024 + 1),
        }),
        413,
      );
      // A normal authenticated request still works after early body rejection.
      await privateJson(await discover(alice));
    });
    let artifact = '',
      download = '';
    const tenant = env.TENANTS.getByName(
      await tenantForAccount(qualificationOrigin, alice.account.id),
    );
    await step('store-fixture', async () => {
      const files: Record<string, string> = {};
      // Fixed storage-routing fixtures, not an engine-created or validated asset.
      for (const [name, body, mime] of [
        ['source.kiln.js', bytes, 'application/javascript'],
        [
          'asset.glb',
          new TextEncoder().encode('glTF-private-routing-fixture'),
          'model/gltf-binary',
        ],
        [
          'manifest.json',
          new TextEncoder().encode('{"fixture":"gateway-routing"}'),
          'application/json',
        ],
      ] as const) {
        const uploaded = await privateJson(
          await tenant.fetch('https://tenant.internal/internal/artifacts', {
            method: 'POST',
            body,
            headers: {
              'content-type': mime,
              'content-length': String(body.byteLength),
              'x-artifact-name': name,
              'x-artifact-sha256': hex(await crypto.subtle.digest('SHA-256', body)),
            },
          }),
          201,
        );
        check(typeof uploaded.id === 'string');
        files[name] = uploaded.id as string;
      }
      artifact = files['source.kiln.js']!;
      const selection = { collection: 'project', assetId: 'preflight-fixture', revisionId: 'v1' };
      await privateJson(
        await tenant.fetch('https://tenant.internal/internal/assets/commit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...selection, mode: 'save', files }),
        }),
        201,
      );
      const ticket = await privateJson(
        await tenant.fetch('https://tenant.internal/internal/downloads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(selection),
        }),
        201,
      );
      check(typeof ticket.ticket === 'string' && /^[a-f0-9]{64}$/.test(ticket.ticket));
      download = `/downloads/${ticket.ticket}/source.kiln.js`;
    });
    const exactSource = async (response: Response) => {
      check(response.status === 200 && response.headers.get('cache-control') === 'no-store');
      check(new TextDecoder().decode(await readBounded(response.body, 1024)) === source);
    };
    await step('bearer-isolation', async () => {
      await exactSource(await send(`/mcp/artifacts/${artifact}`, { headers: bearer(alice) }));
      await discard(
        await send(`/mcp/artifacts/${artifact}`, {
          headers: { ...bearer(bob), 'x-kiln-tenant': alice.account.id },
        }),
        404,
      );
    });
    await step('browser-isolation', async () => {
      await exactSource(await send(download, { headers: { cookie: alice.cookie } }));
      await discard(await send(download, { headers: { cookie: bob.cookie } }), 404);
      await discard(await send(download, { method: 'HEAD' }), 401);
    });
    await step('revoke-connection', async () => {
      const proof = await new D1BrowserSessions(env.ACCOUNTS, qualificationOrigin).read(
        new Request(`${qualificationOrigin}/account`, { headers: { cookie: alice.cookie } }),
      );
      const grant = await new D1Connections(env.ACCOUNTS).revoke(
        proof,
        alice.identity,
        alice.connectionId,
      );
      check(typeof grant === 'string');
      // Deliberately leave the helper token in KV: primary revocation must deny it.
    });
    await step('revoked-token-denied', async () => {
      await discard(await send(`/mcp/artifacts/${artifact}`, { headers: bearer(alice) }), 401);
      await discard(
        await send('/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: alice.refreshToken,
            client_id: alice.clientId,
            resource: `${qualificationOrigin}/mcp`,
          }),
        }),
        400,
      );
      // Revoking one app does not sign the owner's browser out.
      await exactSource(await send(download, { headers: { cookie: alice.cookie } }));
    });
    await step('other-account-preserved', async () => {
      await privateJson(await discover(bob));
      await discard(await send(`/mcp/artifacts/${artifact}`, { headers: bearer(bob) }), 404);
    });
    record.passed = true;
  } catch {
    record.passed = false;
  } finally {
    if (touchedCompute) {
      try {
        await env.CONTROL.setPaused(true);
        const status = await env.COMPUTE.health();
        record.computePaused =
          status.paused && status.activeRequests === 0 && status.pendingCleanup === 0;
      } catch {
        record.computePaused = false;
      }
      record.passed &&= record.computePaused;
    }
    record.state = 'finished';
    await storage.put('gateway-preflight', record);
  }
  return record;
}
