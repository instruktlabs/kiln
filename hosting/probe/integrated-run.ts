import { readBounded } from '../src/http';

export const integratedSource = `function build(){const root=createRoot('Root');
const albedo=proceduralTexture({schemaVersion:2,size:32,usage:'albedo',layers:[{op:'checker',colorA:0xcc2211,colorB:0x22bb33,squares:4}]});
createPart('Textured',boxGeo(1,1,1),pbrMaterial({albedo,roughness:0.7,metalness:0.1}),{parent:root});
createPart('Blue',sphereGeo(0.35),pbrMaterial({albedo:0x2233dd,roughness:0.25,metalness:0.4}),{parent:root,position:[0,0.2,0.85]});return root;}`;
export const integratedCases = [
  'render',
  'save',
  'restore',
  'source',
  'export',
  'glb',
  'manifest',
  'other-source',
  'other-glb',
  'quota',
] as const;
type Case = (typeof integratedCases)[number];
interface AdmissionStatus {
  paused: boolean;
  activeRequests: number;
  pendingCleanup: number;
  maxConcurrent: number;
}
interface Ports {
  open(): Promise<void>;
  close(): Promise<void>;
  pause(): Promise<void>;
  status(): Promise<AdmissionStatus>;
  dispatch(tenant: string, request: Request): Promise<Response>;
  retain(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}
interface Result {
  name: Case;
  passed: boolean;
  elapsedMs: number;
  status?: number;
  bytes?: number;
  sha256?: string;
  reason?: string;
  savedEngine?: string;
}
interface RunRecord {
  state: 'running' | 'finished';
  passed: boolean;
  results: Result[];
  cleanupConfirmed?: boolean;
}
function check(value: unknown): asserts value {
  if (!value) throw new Error('TRIAL_CHECK_FAILED');
}
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function tool(result: Record<string, unknown>) {
  check(result.isError !== true && Array.isArray(result.content));
  const text = result.content.map(object).find((item) => item.type === 'text');
  check(typeof text?.text === 'string');
  return object(JSON.parse(text.text));
}
function fullMaterial(value: unknown) {
  const fidelity = object(value);
  check(fidelity.delivered === 'full-material' && fidelity.degraded === false);
}
const tenantA = 'a'.repeat(43),
  tenantB = 'b'.repeat(43);
function request(id: number, method: string, params: Record<string, unknown>): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  });
  const name = params.name ?? params.uri;
  if (typeof name === 'string') headers.set('mcp-name', name);
  return new Request('https://tenant.internal/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'kiln-private-integration', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

/** One fixed sequence, stopping at the first failure. Retries only read the durable record. */
export async function runIntegratedOnce(
  storage: DurableObjectStorage,
  ports: Ports,
): Promise<RunRecord> {
  const claimed = await storage.transaction(async (tx) => {
    if (await tx.get('run')) return false;
    await tx.put('run', { state: 'running', passed: false, results: [] } satisfies RunRecord);
    return true;
  });
  if (!claimed) return (await storage.get<RunRecord>('run'))!;
  const record: RunRecord = { state: 'running', passed: false, results: [] };
  let ref = '',
    assetId = '',
    revisionId = '',
    retained = 0;
  try {
    await ports.open();
    for (const [index, name] of integratedCases.entries()) {
      const start = Date.now();
      let result: Result = { name, passed: false, elapsedMs: 0 };
      try {
        let method = 'tools/call',
          params: Record<string, unknown>;
        const selector = { collection: 'project', assetId, revisionId };
        switch (name) {
          case 'render':
            params = {
              name: 'kiln_render',
              arguments: { code: integratedSource, capture: { preset: '1x1' } },
            };
            break;
          case 'save':
            params = {
              name: 'kiln_save',
              arguments: {
                programRef: ref,
                collection: 'project',
                name: 'Private integration fixture',
              },
            };
            break;
          case 'restore':
            params = { name: 'kiln_assets', arguments: { ...selector, action: 'restore' } };
            break;
          case 'export':
            params = { name: 'kiln_export', arguments: selector };
            break;
          case 'glb':
          case 'other-glb':
          case 'manifest':
            method = 'resources/read';
            params = {
              uri: `kiln://assets/project/${assetId}/${revisionId}/${name === 'manifest' ? 'manifest.json' : 'asset.glb'}`,
            };
            break;
          default:
            params = { name: 'kiln_source', arguments: { programRef: ref } };
        }
        const response = await ports.dispatch(
          name.startsWith('other-') ? tenantB : tenantA,
          request(index + 1, method, params),
        );
        const bytes = await readBounded(response.body, 8 * 1024 * 1024);
        retained += bytes.byteLength;
        check(retained <= 64 * 1024 * 1024);
        await ports.retain(name, bytes);
        const sha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join('');
        result = { ...result, status: response.status, bytes: bytes.byteLength, sha256 };
        if (name === 'quota') check(response.status === 429);
        else {
          check(response.status === 200);
          const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
          const rpc = object(JSON.parse(text));
          check(rpc.id === index + 1);
          if (name.startsWith('other-')) {
            check(!text.includes(integratedSource));
            check(rpc.error !== undefined || object(rpc.result).isError === true);
            check(rpc.result === undefined || !object(rpc.result).contents);
          } else {
            check(!rpc.error);
            const payload = object(rpc.result);
            if (method === 'tools/call') {
              const data = tool(payload);
              if (name === 'render') {
                check(data.ok === true && typeof data.programRef === 'string');
                ref = data.programRef;
                check(/^(?:p_|sha256:)[a-f0-9]{64}$/.test(ref));
                fullMaterial(data.viewFidelity);
                check((payload.content as unknown[]).some((item) => object(item).type === 'image'));
              } else if (name === 'save') {
                check(data.ok === true);
                const asset = object(data.asset);
                check(typeof asset.assetId === 'string' && typeof asset.revisionId === 'string');
                assetId = asset.assetId;
                revisionId = asset.revisionId;
                for (const id of [assetId, revisionId]) check(/^[a-z][a-z0-9_-]{0,79}$/.test(id));
              } else if (name === 'restore') check(data.programRef === ref);
              else if (name === 'source')
                check(data.code === integratedSource && data.nextOffset === null);
              else check(data.ok === true);
            } else {
              check(Array.isArray(payload.contents) && payload.contents.length === 1);
              const resource = object(payload.contents[0]);
              if (name === 'glb') {
                check(typeof resource.blob === 'string');
                check(atob(resource.blob).startsWith('glTF'));
              } else {
                check(typeof resource.text === 'string');
                const manifest = object(JSON.parse(resource.text));
                check(manifest.assetId === assetId && manifest.revisionId === revisionId);
                fullMaterial(object(manifest.preview).fidelity);
                const engine = object(manifest.build).engine;
                check(typeof engine === 'string');
                result.savedEngine = engine;
              }
            }
          }
        }
        const status = await ports.status();
        check(status.activeRequests === 0 && status.pendingCleanup === 0);
        result.passed = true;
      } catch {
        result.reason = 'TRIAL_CASE_FAILED';
      }
      result.elapsedMs = Date.now() - start;
      record.results.push(result);
      await storage.put('run', record);
      if (!result.passed) break;
    }
  } catch {
    /* Fail closed; retained cases explain how far the fixed sequence reached. */
  } finally {
    const cleanup = await Promise.allSettled([ports.close(), ports.pause()]);
    try {
      const status = await ports.status();
      record.cleanupConfirmed =
        cleanup.every((r) => r.status === 'fulfilled') &&
        status.paused &&
        status.activeRequests === 0 &&
        status.pendingCleanup === 0;
    } catch {
      record.cleanupConfirmed = false;
    }
    record.state = 'finished';
    record.passed =
      record.cleanupConfirmed === true &&
      record.results.length === integratedCases.length &&
      record.results.every((result) => result.passed);
    await storage.put('run', record);
  }
  return record;
}
