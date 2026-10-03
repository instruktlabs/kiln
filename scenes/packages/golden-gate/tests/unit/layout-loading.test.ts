import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPack } from '@kiln-scenes/scene-kit/assets';
import { readGoldenGateLayout } from '../../src/layout';
import { projectLayoutBootstrap, stableLayoutJson } from '../../src/layout-contract';
import { BOOTSTRAP } from '../../src/layout-bootstrap';
import type { SceneLayout } from '../../src/data';

const root = resolve(import.meta.dir, '../..'), source = readFileSync(resolve(root, 'data/layout.json'));
const authored = (): SceneLayout => JSON.parse(source.toString());
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;
const pack = (value: unknown) => ({ data: new Map([['layout', bytes(value)]]) });
const signal = () => new AbortController().signal;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('bootstrap is a reproducible projection of authored data, with bulk geometry and animation paths absent', () => {
  const generated = JSON.parse(readFileSync(resolve(root, 'src/layout-bootstrap.json'), 'utf8'));
  expect(generated.sourceSha256).toBe(createHash('sha256').update(source).digest('hex'));
  expect(stableLayoutJson(generated.projection)).toBe(stableLayoutJson(projectLayoutBootstrap(authored())));
  expect(generated.projection.approaches).toBeUndefined();
  expect(generated.projection.dressing).toBeUndefined();
  expect(generated.projection.fogBanks).toBeUndefined();
  expect(generated.projection.lanes.every((lane: object) => !('polyline' in lane))).toBe(true);
  expect([BOOTSTRAP, BOOTSTRAP.cameras.clip, BOOTSTRAP.lanes, BOOTSTRAP.lanes[0]].every(Object.isFrozen)).toBe(true);
});

test('runtime layout has no fallback for missing, malformed, unsupported or bootstrap-incompatible data', () => {
  expect(() => readGoldenGateLayout({ data: new Map() }, signal())).toThrow('layout');
  expect(() => readGoldenGateLayout({ data: new Map([['layout', new TextEncoder().encode('{').buffer]]) }, signal())).toThrow('layout');
  const badSchema = authored(); (badSchema as { schema: string }).schema = 'golden-gate-layout/99';
  expect(() => readGoldenGateLayout(pack(badSchema), signal())).toThrow('schema');
  const changedCamera = authored(); changedCamera.cameras.clip.far += 1;
  expect(() => readGoldenGateLayout(pack(changedCamera), signal())).toThrow('bootstrap');
  const changedLane = authored(); changedLane.lanes[0]!.x += .1;
  expect(() => readGoldenGateLayout(pack(changedLane), signal())).toThrow('bootstrap');
  const changedLength = authored(); changedLength.approaches.north.length += 1;
  expect(() => { readGoldenGateLayout(pack(changedLength), signal()); }).toThrow('bootstrap');
  const missingBulk = authored(); delete (missingBulk as Partial<SceneLayout>).dressing;
  expect(() => readGoldenGateLayout(pack(missingBulk), signal())).toThrow('dressing');
  const cancelled = new AbortController(), reason = new Error('cancelled mount'); cancelled.abort(reason);
  expect(() => readGoldenGateLayout(pack(authored()), cancelled.signal)).toThrow(reason);
});

test('independent worlds consume their own verified bulk data and cannot replace another world’s layout', () => {
  const a = authored(), b = authored();
  b.fogBanks.banks[0]!.x += 100;
  b.dressing.paint.color = '#123456';
  b.flights.paths[0]!.keys[0]!.position[1] += 20;
  const first = readGoldenGateLayout(pack(a), signal()), second = readGoldenGateLayout(pack(b), signal());
  expect(first).toEqual(a); expect(second).toEqual(b); expect(first).not.toBe(second);
  second.fogBanks.banks[0]!.x += 1;
  expect(first.fogBanks.banks[0]!.x).toBe(a.fogBanks.banks[0]!.x);
  // The early camera, tiers and lane/bridge constants are admitted only when identical to this verified layout.
  expect(projectLayoutBootstrap(first)).toEqual(projectLayoutBootstrap(second));
  expect(projectLayoutBootstrap(first)).toEqual(BOOTSTRAP);
});

test.each([
  ['approach alignment', (layout: SceneLayout) => { layout.approaches.north.alignment = null as never; }],
  ['empty route profile', (layout: SceneLayout) => { layout.approaches.south.profile = []; }],
  ['dressing canopy', (layout: SceneLayout) => { layout.dressing.plaza.canopy = null as never; }],
  ['zero light spacing', (layout: SceneLayout) => { layout.dressing.lights.spacing = 0; }],
  ['fog wrap', (layout: SceneLayout) => { layout.fogBanks.wrap.west = layout.fogBanks.wrap.east; }],
  ['fog tuple', (layout: SceneLayout) => { layout.fogBanks.banks[0]!.spread = null as never; }],
  ['flight coordinate', (layout: SceneLayout) => { layout.flights.paths[0]!.keys[0]!.position[0] = null as never; }],
  ['duplicate flight', (layout: SceneLayout) => { layout.flights.paths.push(layout.flights.paths[0]!); }],
] as const)('malformed bulk data is rejected before construction: %s', (_name, change) => {
  const layout = authored(); change(layout);
  expect(() => { readGoldenGateLayout(pack(layout), signal()); }).toThrow('Invalid Golden Gate layout');
});

test('the existing pack loader supplies layout exactly once, rejects corrupt bytes and preserves cancellation', async () => {
  const body = bytes(authored()), digest = createHash('sha256').update(new Uint8Array(body)).digest('hex');
  const manifest = { schema: 'kiln.scene-pack/1', id: 'golden-gate', release: 'fixture', three: '0.186.0', models: [], data: { layout: 'data/layout.json' },
    files: [{ path: 'data/layout.json', bytes: body.byteLength, sha256: digest }] };
  let requests = 0, corrupt = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith('pack.json')) return Response.json(manifest);
    requests++; return new Response(corrupt ? new Uint8Array(body.byteLength) : body);
  }) as typeof fetch;
  const loaded = await loadPack('https://example.test/golden-gate/', { signal: signal() });
  expect(readGoldenGateLayout(loaded, signal())).toEqual(authored()); expect(requests).toBe(1);
  corrupt = true;
  await expect(loadPack('https://example.test/golden-gate/', { signal: signal() })).rejects.toMatchObject({ code: 'asset-hash' });
  const cancelled = new AbortController(), reason = new Error('cancelled layout fetch');
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith('pack.json')) return Response.json(manifest);
    cancelled.abort(reason); return new Response(body);
  }) as typeof fetch;
  await expect(loadPack('https://example.test/golden-gate/', { signal: cancelled.signal })).rejects.toThrow(reason);
});

test('world construction refuses missing or cancelled layout before accessing renderer or tier resources', async () => {
  await import('three');
  const { buildGoldenGateWorld } = await import('../../src/world/build-world');
  const context = { pack: { data: new Map() }, signal: signal(),
    get knobs() { throw new Error('world resources accessed'); }, get renderer() { throw new Error('renderer accessed'); } };
  await expect(buildGoldenGateWorld(context as never)).rejects.toThrow('layout is missing');
  const corrupt = Object.create(context), badLayout = authored(); badLayout.dressing.plaza.canopy = null as never; corrupt.pack = pack(badLayout);
  await expect(buildGoldenGateWorld(corrupt)).rejects.toThrow('dressing.plaza.canopy');
  const cancelled = new AbortController(); cancelled.abort(new Error('cancelled before world'));
  const aborted = Object.create(context); aborted.signal = cancelled.signal;
  await expect(buildGoldenGateWorld(aborted)).rejects.toThrow('cancelled before world');
});

test('the pre-load camera and tier clip planes exactly match admitted runtime data', async () => {
  await import('three');
  const { goldenGateDefinition } = await import('../../src/definition');
  const { goldenGateTiers } = await import('../../src/tiers');
  const { classifyDevice, resolveTier } = await import('@kiln-scenes/scene-kit');
  const layout = readGoldenGateLayout(pack(authored()), signal()), pose = layout.cameras.named[layout.cameras.default]!;
  expect(goldenGateDefinition.camera).toEqual({ position: pose.position, fov: pose.fov, near: layout.cameras.clip.near, far: layout.cameras.clip.far });
  const { device } = classifyDevice({ backend: 'webgpu', hardwareConcurrency: 8, devicePixelRatio: 1, screenWidth: 1920, screenHeight: 1080,
    coarsePointer: false, mobileUA: false, saveData: false, prefersReducedMotion: false }, goldenGateTiers);
  for (const tier of goldenGateTiers.order) expect(resolveTier(goldenGateTiers, tier, device).drawDistance.far).toBe(layout.cameras.clip.far);
});

test('fog and flight constructors consume independent runtime layout values', async () => {
  await import('three');
  const { DataTexture } = await import('three/webgpu');
  const { createFogBanks } = await import('../../src/world/fog-banks');
  const { createAtmosphereUniforms } = await import('../../src/world/fog');
  const { flightPaths } = await import('../../src/camera/flights');
  const a = authored(), b = authored(); a.fogBanks.banks[0]!.puffs = 2; b.fogBanks.banks[0]!.puffs = 5;
  b.flights.paths[0]!.keys[0]!.position[1] += 100;
  const noise = new DataTexture(), first = createFogBanks(createAtmosphereUniforms(), noise, 1, a.fogBanks), second = createFogBanks(createAtmosphereUniforms(), noise, 1, b.fogBanks);
  try {
    expect([first.puffs, second.puffs]).toEqual([2, 5]);
    expect(flightPaths(b)[0]!.keys[0]!.position[1] - flightPaths(a)[0]!.keys[0]!.position[1]).toBe(100);
  } finally { first.dispose(); second.dispose(); noise.dispose(); }
});
