/**
 * The viewer host builds a variant of a saved revision only when a builder is injected, only
 * for a same-origin JSON POST, and through the same path as kiln_export.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../assets-node';
import { startAssetViewer } from '../asset-viewer';
import { MemoryProgramStore } from '../program-store';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { createVariantBuilder } from '../variant-build';

const CODE = `const meta = { name: 'Shelf' };
const P = defineParams({
  width: { type: 'range', default: 1, min: 0.5, max: 2 },
  shelves: { type: 'int', default: 2, min: 1, max: 4 },
}, { presets: { wide: { width: 2 } } });
function build() {
  const root = createRoot('Shelf');
  for (let i = 0; i < P.shelves; i++)
    createPart('Board' + i, boxGeo(P.width, 0.05, 0.3), gameMaterial(0x8a5a33), {
      parent: root,
      position: [0, 0.3 + i * 0.4, 0],
    });
  return root;
}`;

let root: string;
let library: FileAssetLibrary;
let saved: { assetId: string; revisionId: string };
let viewer: Awaited<ReturnType<typeof startAssetViewer>>;
let bare: Awaited<ReturnType<typeof startAssetViewer>>;
let builds = 0;

const post = (base: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}api/variant`, {
    method: 'POST',
    headers: {
      Origin: base.slice(0, -1),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
const request = (params: unknown) => ({ collection: 'project', ...saved, params });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-viewer-variant-'));
  library = new FileAssetLibrary({ project: root });
  const programStore = new MemoryProgramStore();
  const result = (await createKilnProgramToolRegistry({ assetLibrary: library, programStore })
    .find((def) => def.name === 'kiln_save')!
    .run({
      programRef: await programStore.put(CODE),
      name: 'Shelf',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
  saved = { assetId: result.asset.assetId, revisionId: result.asset.revisionId };
  const build = createVariantBuilder(library, { programStore });
  viewer = await startAssetViewer(library, {
    port: 0,
    variants: (input) => {
      builds++;
      return build(input);
    },
  });
  bare = await startAssetViewer(library, { port: 0 });
}, 60_000);
afterAll(async () => {
  await viewer.close();
  await bare.close();
  await rm(root, { recursive: true, force: true });
});

describe('viewer variant endpoint', () => {
  test('reports whether this host can build variants', async () => {
    expect(await (await fetch(`${viewer.url}api/variant`)).json()).toEqual({ available: true });
    expect(await (await fetch(`${bare.url}api/variant`)).json()).toEqual({ available: false });
    const refused = await post(bare.url, request({ values: { shelves: 3 } }));
    expect(refused.status).toBe(404);
    expect((await refused.json()).error).toContain('kiln view');
  });

  test('builds the requested values and describes the bytes it returns', async () => {
    const response = await post(viewer.url, request({ preset: 'wide', values: { shelves: 4 } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const described = JSON.parse(decodeURIComponent(response.headers.get('X-Kiln-Variant')!));
    expect(described).toEqual({
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      triangles: 48,
      params: { preset: 'wide', values: { width: 2, shelves: 4 } },
      defaultBuildMatchesSaved: true,
    });
    const record = await library.read('project', saved.assetId, saved.revisionId);
    expect(bytes.byteLength).not.toBe(record.files['asset.glb']!.byteLength);
    // Nothing is saved by building a variant.
    expect((await library.list('project')).length).toBe(1);
  }, 60_000);

  test('names a refused value and never builds for a request that is not the page', async () => {
    const before = builds;
    const refused = await post(viewer.url, request({ values: { shelves: 9 } }));
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('shelves takes 1 to 4');
    const counted = builds;
    expect(counted).toBe(before + 1);

    // A cross-site page: no Origin (a plain form or image request), another Origin, or a
    // content type a form can send without a preflight.
    const noOrigin = await fetch(`${viewer.url}api/variant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request({ values: { shelves: 3 } })),
    });
    expect(noOrigin.status).toBe(403);
    expect((await post(viewer.url, request({}), { Origin: 'https://example.com' })).status).toBe(
      403,
    );
    expect((await post(viewer.url, request({}), { 'Content-Type': 'text/plain' })).status).toBe(
      415,
    );
    // Only the documented request shape is accepted.
    expect((await post(viewer.url, { ...request({}), extra: 1 })).status).toBe(400);
    expect((await post(viewer.url, request({ sweep: true }))).status).toBe(400);
    expect((await post(viewer.url, { collection: 'project', params: {} })).status).toBe(400);
    expect(builds).toBe(counted);

    const unknown = await post(viewer.url, {
      collection: 'project',
      assetId: saved.assetId,
      revisionId: 'r_0000000000000000000000000000000000',
      params: { values: { shelves: 3 } },
    });
    expect(unknown.status).toBe(400);
  }, 60_000);
});
