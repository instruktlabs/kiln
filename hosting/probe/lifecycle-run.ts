import { readBounded } from '../src/http';

export { lifecycleBudget } from './lifecycle-budget';
export const lifecycleCases = [
  'material-create',
  'material-get',
  'render',
  'save',
  'restore',
  'source',
  'export',
  'glb',
  'manifest',
  'source-download',
  'glb-download',
  'material-download',
  'foreign-download',
  'anonymous-download',
  'foreign-source',
  'foreign-material',
  'drop-live-material',
  'import',
  'imported-material',
  'rerender',
  'quota',
] as const;
type Case = (typeof lifecycleCases)[number];
type Account = 'owner' | 'other';
interface Status {
  paused: boolean;
  activeRequests: number;
  pendingCleanup: number;
}
interface Ports {
  expectedImage: string;
  open(): Promise<void>;
  close(): Promise<void>;
  pause(): Promise<void>;
  status(): Promise<Status>;
  mcp(account: Account, request: Request): Promise<Response>;
  download(account: Account | 'anonymous', path: string, signal: AbortSignal): Promise<Response>;
  dropMaterial(materialId: string, revisionId: string): Promise<void>;
  retain(name: Case, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}
interface Result {
  name: Case;
  passed: boolean;
  elapsedMs: number;
  status?: number;
  bytes?: number;
  sha256?: string;
  savedEngine?: string;
}
interface Record {
  state: 'running' | 'finished';
  passed: boolean;
  admissionIdleAndPaused: boolean;
  results: Result[];
}
const origin = 'https://kiln-private-qualification.invalid';
const check: (value: unknown) => asserts value = (value) => {
  if (!value) throw new Error('PRIVATE_LIFECYCLE_CHECK');
};
function object(value: unknown): { [key: string]: unknown } {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as { [key: string]: unknown };
}
function tool(value: unknown) {
  const result = object(value);
  check(result.isError !== true && Array.isArray(result.content));
  const text = result.content.map(object).find((item) => item.type === 'text');
  check(typeof text?.text === 'string');
  return object(JSON.parse(text.text));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const item = object(value);
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function fullMaterial(value: unknown) {
  const fidelity = object(value);
  check(
    fidelity.delivered === 'full-material' &&
      fidelity.degraded === false &&
      fidelity.materialFaithful === true,
  );
}
function rejectPrivateData(value: unknown, source: string, material: string, depth = 0): void {
  check(depth < 32);
  if (typeof value === 'string') {
    check(!value.includes(source) && !value.includes(material));
    // MCP content may itself contain JSON. Inspect decoded strings as well as
    // ordinary object fields so escaping cannot hide a leaked source document.
    if (/^\s*[[{]/.test(value)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return;
      }
      rejectPrivateData(parsed, source, material, depth + 1);
    }
  } else if (value && typeof value === 'object') {
    check(canonical(value) !== material);
    for (const child of Object.values(value)) rejectPrivateData(child, source, material, depth + 1);
  }
}
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
function downloadPath(url: unknown, filename: string): string {
  check(typeof url === 'string');
  const parsed = new URL(url);
  check(
    parsed.origin === origin &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash,
  );
  check(/^\/downloads\/[a-f0-9]{64}\/[a-z.]+$/.test(parsed.pathname));
  check(parsed.pathname.endsWith(`/${filename}`));
  return parsed.pathname;
}
function request(
  id: number,
  method: string,
  params: { [key: string]: unknown },
  signal: AbortSignal,
) {
  const headers = new Headers({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  });
  const name = params.name ?? params.uri;
  if (typeof name === 'string') headers.set('mcp-name', name);
  return new Request(`${origin}/mcp`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'kiln-private-lifecycle', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}
async function bounded<T>(
  work: Promise<T>,
  milliseconds: number,
  abort?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort?.abort();
          reject(new Error('PRIVATE_LIFECYCLE_DEADLINE'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
const materialDraft = {
  materialId: 'qualification-stone',
  name: 'Private qualification stone',
  tileable: true,
  sources: [
    {
      id: 'authored',
      kind: 'procedural',
      provider: 'Kiln',
      creator: 'Fixture author',
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
      originalFiles: [],
    },
  ],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'authored',
      transforms: [],
      procedural: {
        schemaVersion: 2,
        size: 8,
        usage: 'albedo',
        layers: [
          { op: 'noise', colorA: 0x779944, colorB: 0xeeeecc, seed: 17, scale: 4, octaves: 2 },
        ],
      },
    },
  ],
};

/** Fixed native stage. The outer private driver owns synthetic credentials and
 * the durable VM allowance; neither can be selected by these request bodies.
 */
export async function runLifecycleOnce(
  storage: DurableObjectStorage,
  ports: Ports,
): Promise<Record> {
  const record: Record = {
    state: 'running',
    passed: false,
    admissionIdleAndPaused: false,
    results: [],
  };
  const claimed = await storage.transaction(async (tx) => {
    if (await tx.get('native-lifecycle')) return false;
    await tx.put('native-lifecycle', record);
    return true;
  });
  if (!claimed) return (await storage.get<Record>('native-lifecycle'))!;
  let opened = false,
    retained = 0,
    code = '',
    ref = '',
    assetId = '',
    revisionId = '',
    glbHash = '';
  let material: { [key: string]: unknown } = {},
    materialRevision = '';
  let downloads: { [key: string]: unknown } = {};
  try {
    check(/^sha256:[a-f0-9]{64}$/.test(ports.expectedImage));
    opened = true;
    await bounded(ports.open(), 10000);
    for (const [index, name] of lifecycleCases.entries()) {
      const started = Date.now();
      const result: Result = { name, passed: false, elapsedMs: 0 };
      const controller = new AbortController();
      try {
        const selection = { collection: 'project', assetId, revisionId };
        const materialDependencies = [
          {
            resourceId: 'qualification-stone',
            revisionId: materialRevision,
            sha256: materialRevision,
          },
        ];
        if (name === 'drop-live-material') {
          await bounded(ports.dropMaterial('qualification-stone', materialRevision), 10000);
        } else {
          let response: Response;
          let resource = false;
          let rpc = true;
          if (name.endsWith('-download')) {
            rpc = false;
            const file =
              name === 'glb-download'
                ? 'asset.glb'
                : name === 'material-download'
                  ? 'materials.kiln.json'
                  : 'source.kiln.js';
            const account =
              name === 'foreign-download'
                ? 'other'
                : name === 'anonymous-download'
                  ? 'anonymous'
                  : 'owner';
            response = await bounded(
              ports.download(account, downloadPath(downloads[file], file), controller.signal),
              15000,
              controller,
            );
          } else {
            let method = 'tools/call';
            let params: { [key: string]: unknown };
            switch (name) {
              case 'material-create':
                params = {
                  name: 'kiln_material_create_procedural',
                  arguments: { draft: materialDraft },
                };
                break;
              case 'material-get':
              case 'foreign-material':
              case 'imported-material':
                params = {
                  name: 'kiln_material_get',
                  arguments: {
                    materialId: 'qualification-stone',
                    revisionId: materialRevision,
                  },
                };
                break;
              case 'render':
                params = {
                  name: 'kiln_render',
                  arguments: { code, materialDependencies, capture: { preset: '1x1' } },
                };
                break;
              case 'rerender':
                params = {
                  name: 'kiln_render',
                  arguments: { programRef: ref, materialDependencies, capture: { preset: '1x1' } },
                };
                break;
              case 'save':
                params = {
                  name: 'kiln_save',
                  arguments: {
                    programRef: ref,
                    materialDependencies,
                    collection: 'project',
                    name: 'Private material qualification',
                  },
                };
                break;
              case 'restore':
                params = { name: 'kiln_assets_restore', arguments: selection };
                break;
              case 'export':
                params = { name: 'kiln_export', arguments: selection };
                break;
              case 'import':
                params = {
                  name: 'kiln_import',
                  arguments: { ...selection, sourceCollection: 'project', collection: 'library' },
                };
                break;
              case 'glb':
              case 'manifest':
                method = 'resources/read';
                resource = true;
                params = {
                  uri: `kiln://assets/project/${assetId}/${revisionId}/${name === 'glb' ? 'asset.glb' : 'manifest.json'}`,
                };
                break;
              default:
                params = { name: 'kiln_source', arguments: { programRef: ref } };
            }
            response = await bounded(
              ports.mcp(
                name.startsWith('foreign-') ? 'other' : 'owner',
                request(index + 1, method, params, controller.signal),
              ),
              140000,
              controller,
            );
          }
          const bytes = await bounded(
            readBounded(response.body, 8 * 1024 * 1024, controller.signal),
            10000,
            controller,
          );
          retained += bytes.byteLength;
          check(retained <= 64 * 1024 * 1024);
          result.status = response.status;
          result.bytes = bytes.byteLength;
          result.sha256 = await hash(bytes);
          await bounded(ports.retain(name, bytes), 10000);
          if (name === 'quota') check(response.status === 429);
          else if (name === 'foreign-download' || name === 'anonymous-download') {
            check(response.status === (name === 'foreign-download' ? 404 : 401));
            check(result.sha256 !== glbHash);
            rejectPrivateData(new TextDecoder().decode(bytes), code, canonical(material));
          } else {
            check(response.status === 200);
            if (!rpc) {
              check(
                response.headers
                  .get('cache-control')
                  ?.split(',')
                  .map((value) => value.trim())
                  .includes('no-store'),
              );
              if (name === 'glb-download') check(result.sha256 === glbHash);
              else if (name === 'source-download') check(new TextDecoder().decode(bytes) === code);
              else {
                const closure = object(JSON.parse(new TextDecoder().decode(bytes)));
                check(Array.isArray(closure.records) && closure.records.length === 1);
                check(canonical(object(closure.records[0]).manifest) === canonical(material));
              }
            } else {
              const message = object(
                JSON.parse(
                  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
                ),
              );
              check(message.id === index + 1);
              if (name.startsWith('foreign-')) {
                rejectPrivateData(message, code, canonical(material));
                check(message.error !== undefined || object(message.result).isError === true);
              } else {
                check(message.error === undefined);
                const payload = object(message.result);
                if (resource) {
                  check(Array.isArray(payload.contents) && payload.contents.length === 1);
                  const item = object(payload.contents[0]);
                  if (name === 'glb') {
                    check(typeof item.blob === 'string');
                    const glb = Uint8Array.from(atob(item.blob), (char) => char.charCodeAt(0));
                    check(glb.byteLength >= 20);
                    const header = new DataView(glb.buffer);
                    check(
                      header.getUint32(0, true) === 0x46546c67 &&
                        header.getUint32(4, true) === 2 &&
                        header.getUint32(8, true) === glb.byteLength,
                    );
                    glbHash = await hash(glb);
                  } else {
                    check(typeof item.text === 'string');
                    const manifest = object(JSON.parse(item.text));
                    check(manifest.assetId === assetId && manifest.revisionId === revisionId);
                    fullMaterial(object(manifest.preview).fidelity);
                    const engine = object(manifest.build).engine;
                    check(engine === `cloudflare-container:${ports.expectedImage}`);
                    result.savedEngine = engine;
                  }
                } else {
                  const value = tool(payload);
                  if (name === 'material-create') {
                    material = object(value.material);
                    check(
                      material.materialId === 'qualification-stone' &&
                        typeof material.revisionId === 'string' &&
                        /^sha256:[a-f0-9]{64}$/.test(material.revisionId),
                    );
                    materialRevision = material.revisionId;
                    const spec = object(value.portableSpec);
                    code = `async function build(){const r=createRoot('Root');const m=await compilePortableMaterialSpecV2(${JSON.stringify(spec)});createPart('Body',boxGeo(1,1,1),m,{parent:r});return r;}`;
                  } else if (name === 'material-get' || name === 'imported-material')
                    check(canonical(value.material) === canonical(material));
                  else if (name === 'render' || name === 'rerender') {
                    check(
                      value.ok === true &&
                        typeof value.programRef === 'string' &&
                        /^(?:p_|sha256:)[a-f0-9]{64}$/.test(value.programRef),
                    );
                    if (name === 'rerender') check(value.programRef === ref);
                    ref = value.programRef;
                    fullMaterial(value.viewFidelity);
                    check(
                      (payload.content as unknown[]).some((item) => object(item).type === 'image'),
                    );
                  } else if (name === 'save') {
                    check(value.ok === true);
                    const asset = object(value.asset);
                    check(
                      typeof asset.assetId === 'string' && typeof asset.revisionId === 'string',
                    );
                    assetId = asset.assetId;
                    revisionId = asset.revisionId;
                    check([assetId, revisionId].every((id) => /^[a-z][a-z0-9_-]{0,79}$/.test(id)));
                    downloads = object(value.downloadUrls);
                  } else if (name === 'restore') check(value.programRef === ref);
                  else if (name === 'source')
                    check(value.code === code && value.nextOffset === null);
                  else check(value.ok === true);
                }
              }
            }
          }
        }
        const status = await bounded(ports.status(), 10000);
        check(status.activeRequests === 0 && status.pendingCleanup === 0);
        result.passed = true;
      } catch {
        /* Fixed case label and outcome only; never retain exceptions. */
      } finally {
        controller.abort();
      }
      result.elapsedMs = Date.now() - started;
      record.results.push(result);
      await storage.put('native-lifecycle', record);
      if (!result.passed) break;
    }
  } catch {
    /* A partial or failed setup cannot authorize another run. */
  } finally {
    if (opened) {
      const closing = await Promise.allSettled([
        bounded(ports.close(), 10000),
        bounded(ports.pause(), 10000),
      ]);
      try {
        const status = await bounded(ports.status(), 10000);
        record.admissionIdleAndPaused =
          closing.every((result) => result.status === 'fulfilled') &&
          status.paused &&
          status.activeRequests === 0 &&
          status.pendingCleanup === 0;
      } catch {
        record.admissionIdleAndPaused = false;
      }
    }
    record.state = 'finished';
    record.passed =
      record.admissionIdleAndPaused &&
      record.results.length === lifecycleCases.length &&
      record.results.every((result) => result.passed);
    await storage.put('native-lifecycle', record);
  }
  return record;
}
