import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RIG_ID, resolveRigEngine, fitCamera, orbitDirection } from './rig-render.mjs';
import { applyRigPoster, applyRigPosters, rigPosterImage, rigPosterKey, rigPosterPath } from './rig-posters-core.mjs';
import { H7_ID, SEED_TOWN_ID, VEHICLE_POSTER, bridgeTargets, farmTargets, h7Targets, holodeckPosterView, pruneImagePlan, recordPosters, seedTownTargets, vehicleTargets } from './rig-posters.mjs';
import { BRIDGE_CAPTURES, bridgeCaptureKey, bridgeCapturePath } from './bridge-captures.mjs';
import { hashBytes } from './mirror-core.mjs';

const DATA = resolve(import.meta.dir, '../src/data');
const json = async (file: string) => JSON.parse(await readFile(join(DATA, file), 'utf8'));
const runFor = (recorded: { rig: { runs: { pack: string }[] } }, pack: string) => recorded.rig.runs.find((run) => run.pack === pack) as any;

const record = {
  path: 'media/rig/review-neutral-v1/farm/r34/barn.png',
  width: 1024,
  height: 1024,
  revisionId: 'r_barn',
};
const asset = { slug: 'barn', revisionId: 'r_barn', description: 'Red barn.', poster: { alt: 'Old alt', inputPath: 'media/farm/r33/cutout/barn.webp', revisionQualification: 'Exterior view from r33.', exactRevision: false } };

test('the cabin sofa poster looks toward the seating, preserving the standard view for other assets', () => {
  expect(holodeckPosterView('winter-wmc-sofa-wool').direction).toEqual([0.7, 0.5, -0.7]);
  expect(holodeckPosterView('winter-wmc-loft-bed').direction).toEqual([0.7, 0.5, 0.7]);
});

describe('rig poster records', () => {
  test('a poster path carries the rig, pack, release and asset', () => {
    expect(rigPosterPath('farm', 'r34', 'barn')).toBe('media/rig/review-neutral-v1/farm/r34/barn.png');
    expect(rigPosterKey('farm', 'barn')).toBe('farm:barn');
  });

  test('the catalog image is a webp with responsive variants that never exceed the source width', () => {
    const image = rigPosterImage(record, 'Red barn.');
    expect(image.src).toBe('/media/rig/review-neutral-v1/farm/r34/barn.webp');
    expect(image.inputPath).toBe(record.path);
    expect(image.srcsetAvif).toContain('/media/rig/review-neutral-v1/farm/r34/barn-1024.avif 1024w');
    expect(image.srcsetAvif).not.toContain('1440w');
    expect(image).toMatchObject({ exactRevision: true, rig: RIG_ID, sourceRevisionId: 'r_barn', width: 1024, height: 1024 });
  });

  test('applying a record replaces the poster and drops the parent-revision qualification', () => {
    const next = applyRigPoster(asset, record);
    expect(next.poster.exactRevision).toBe(true);
    expect('revisionQualification' in next.poster).toBe(false);
    expect(next.poster.alt).toBe('Old alt');
    expect(applyRigPoster(asset, undefined)).toBe(asset);
  });

  test('a record for another revision is refused instead of mislabelled', () => {
    expect(() => applyRigPoster({ ...asset, revisionId: 'r_other' }, record)).toThrow(/rendered from r_barn/);
  });

  test('a list of assets takes the record of its own pack only', () => {
    const recorded = { posters: { 'farm:barn': record } };
    expect(applyRigPosters([asset], 'farm', recorded)[0].poster.rig).toBe(RIG_ID);
    expect(applyRigPosters([asset], 'vehicles', recorded)[0]).toBe(asset);
  });
});

describe('image plan pruning', () => {
  test('drops plan images no catalog references and keeps the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-prune-'));
    try {
      await mkdir(join(dir, 'packs'), { recursive: true });
      await writeFile(join(dir, 'commons-build.json'), JSON.stringify({ images: [{ inputPath: 'media/a.png' }, { inputPath: 'media/b.png' }] }));
      await writeFile(join(dir, 'packs/x.json'), JSON.stringify({ poster: { inputPath: 'media/a.png' } }, null, 2));
      expect(await pruneImagePlan({ data: dir })).toEqual(['media/b.png']);
      expect(JSON.parse(await readFile(join(dir, 'commons-build.json'), 'utf8')).images).toEqual([{ inputPath: 'media/a.png' }]);
      expect(await pruneImagePlan({ data: dir })).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('camera fit', () => {
  const engine = {
    camera: {
      cameraFromBounds: (bounds: { min: number[]; max: number[] }, direction: number[], padding: number) => ({ version: 'kiln.camera.v1', projection: 'orthographic', position: [1, 1, 1], target: [0, 0, 0], up: [0, 1, 0], aspect: 1, near: 1, far: 9, halfHeight: padding * 2, seen: { bounds, direction } }),
      validateResolvedAssetCamera: (camera: object) => camera,
    },
  };
  const bounds = { min: [-6, 0, -1], max: [6, 3, 1] };

  test('a square target keeps the engine fit unchanged', () => {
    const camera = fitCamera(engine, bounds, [1, 0, 0]) as { halfHeight: number; aspect: number };
    expect(camera).toMatchObject({ halfHeight: 2, aspect: 1 });
  });

  test('a wide target is filled from the projected extents, not padded to a square', () => {
    // Side view along +X: the screen is Z across and Y up, so the wide (Z) and tall (Y) extents are 1 and 1.5.
    const camera = fitCamera(engine, { min: [-1, 0, -6], max: [1, 3, 6] }, [1, 0, 0], { aspect: 2 }) as { halfHeight: number; aspect: number };
    expect(camera.aspect).toBe(2);
    expect(camera.halfHeight).toBeCloseTo(6 / 2 / 0.9, 5);
  });

  test('orbit angles follow the engine convention', () => {
    expect(orbitDirection(0, 0)).toEqual([1, 0, 0]);
    const [x, y, z] = orbitDirection(90, 30);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0.5, 9);
    expect(z).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 9);
  });
});

describe('the checked-in Farm posters', () => {
  test('every Farm asset has a rig poster rendered from its own sealed GLB, pinned and planned', async () => {
    const [farm, recorded, manifest, plan] = await Promise.all([json('packs/farm.json'), json('rig-posters.json'), json('mirror-manifest.json'), json('commons-build.json')]);
    expect(recorded.rig.id).toBe(RIG_ID);
    expect(recorded.rig.backdrop).toBe('neutral');
    expect(runFor(recorded, 'farm').engine.commit).toMatch(/^[0-9a-f]{40}$/);
    // One record per run, each with its own id: a later run of a pack no longer overwrites an earlier one.
    expect(recorded.rig.runs.map((run: { id: string }) => run.id)).toEqual([...new Set(recorded.rig.runs.map((run: { id: string }) => run.id))]);
    const pins = new Map<string, { path: string; bytes: number; sha256: string }>(manifest.files.map((file: { path: string; bytes: number; sha256: string }) => [file.path, file]));
    const planned = new Set(plan.images.map((image: { inputPath: string }) => image.inputPath));
    expect(farm.assets).toHaveLength(23);
    for (const item of farm.assets) {
      const poster = recorded.posters[rigPosterKey('farm', item.slug)];
      expect(poster, item.slug).toBeDefined();
      expect(poster.revisionId).toBe(item.revisionId);
      expect(poster.glb.sha256).toBe(item.runtimeDownload.sha256);
      // A model in a sealed archive is named by its member; one delivered as its own file, by its pinned path.
      expect(poster.glb.member).toBe(item.runtimeDownload.member ?? item.runtimeDownload.path);
      expect(item.poster.inputPath).toBe(poster.path);
      expect(item.poster.rig).toBe(RIG_ID);
      expect(item.poster.exactRevision).toBe(true);
      expect('revisionQualification' in item.poster).toBe(false);
      expect(pins.get(poster.path)).toEqual({ path: poster.path, bytes: poster.bytes, sha256: poster.sha256 });
      expect(planned.has(poster.path)).toBe(true);
      expect(planned.has(`media/farm/r33/cutout/${item.slug}.webp`)).toBe(false);
    }
  });

  test('every vehicle has a rig poster from the same place, rendered from its own delivered GLB, pinned and planned', async () => {
    const [vehicles, recorded, manifest, plan] = await Promise.all([json('packs/vehicles.json'), json('rig-posters.json'), json('mirror-manifest.json'), json('commons-build.json')]);
    expect(runFor(recorded, 'vehicles').engine.commit).toBe(runFor(recorded, 'farm').engine.commit);
    // All six final posters must bind the newly delivered runtime, independently of saved-preview canonical bytes.
    expect(runFor(recorded, 'vehicles').engine).toMatchObject({ commit: 'ac6d9eb492b4891a54dbf563cfef14af5633254a', dirty: true });
    expect(runFor(recorded, 'vehicles').service).toMatchObject({
      protocol: 'kiln.render-service.v2',
      sourceFingerprint: 'sha256:ea13cf0d48a53734132568066d5a94121c8dd3b088ea8606b1c4dbe14b896ef6',
      buildFingerprint: 'sha256:56d89e736bb03575c9131be509f3411c9b764750d354f82d8a601188e723b576',
      dependencies: { three: '0.186.0', webgpu: '0.6.1', pngjs: '7.0.0' },
    });
    const pins = new Map<string, { path: string; bytes: number; sha256: string }>(manifest.files.map((file: { path: string; bytes: number; sha256: string }) => [file.path, file]));
    const planned = new Set(plan.images.map((image: { inputPath: string }) => image.inputPath));
    expect(vehicles.assets).toHaveLength(6);
    for (const item of vehicles.assets) {
      const poster = recorded.posters[rigPosterKey('vehicles', item.slug)];
      expect(poster, item.slug).toBeDefined();
      expect(vehicles.release).toBe('r5-flush-fix');
      expect(poster.path).toBe(rigPosterPath('vehicles', vehicles.release, item.slug));
      expect(poster.revisionId).toBe(item.revisionId);
      expect(poster.glb.sha256).toBe(item.runtimeDownload.sha256);
      expect(poster.glb.bytes).toBe(item.runtimeDownload.bytes);
      // The runtime member can differ from the saved canonical export through explicit wheel-cull links.
      expect(poster.glb.member).toEndWith(`/models/${item.slug}.glb`);
      expect(item.poster.inputPath).toBe(poster.path);
      expect(item.poster.rig).toBe(RIG_ID);
      expect(item.poster.exactRevision).toBe(true);
      expect(pins.get(poster.path)).toEqual({ path: poster.path, bytes: poster.bytes, sha256: poster.sha256 });
      expect(planned.has(poster.path)).toBe(true);
      // Every vehicle is seen from the same place so the cards line up.
      poster.view.direction.forEach((value: number, axis: number) => expect(value).toBeCloseTo(VEHICLE_POSTER.direction[axis]!, 12));
      expect([poster.width, poster.height]).toEqual([VEHICLE_POSTER.width, VEHICLE_POSTER.height]);
    }
  });

  test('vehicle targets are the delivered GLBs of the mirror, verified against the catalog', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'kiln-site-vehicle-targets-'));
    try {
      const glb = Buffer.from('a delivered vehicle');
      const download = { path: 'packs/vehicles/r1/models/sedan.glb', bytes: glb.length, sha256: hashBytes(glb) };
      await mkdir(join(temp, 'data/packs'), { recursive: true });
      await mkdir(join(temp, 'mirror/packs/vehicles/r1/models'), { recursive: true });
      await writeFile(join(temp, 'data/packs/vehicles.json'), JSON.stringify({ release: 'r1', assets: [{ slug: 'sedan', name: 'Sedan', assetId: 'generic-sedan', revisionId: 'r_sedan', description: 'A sedan.', runtimeDownload: download }] }));
      await writeFile(join(temp, 'mirror', download.path), glb);
      const [target] = await vehicleTargets({ mirror: join(temp, 'mirror'), data: join(temp, 'data') });
      expect(target).toMatchObject({ pack: 'vehicles', release: 'r1', slug: 'sedan', revisionId: 'r_sedan', glbPath: download.path, view: VEHICLE_POSTER });
      expect(target!.glb.equals(glb)).toBe(true);
      // A file that is not the pinned one is refused, not rendered.
      await writeFile(join(temp, 'mirror', download.path), Buffer.from('another vehicle!!'));
      await expect(vehicleTargets({ mirror: join(temp, 'mirror'), data: join(temp, 'data') })).rejects.toThrow('SHA-256/size verification failed for sedan');
    } finally {
      const target = resolve(temp);
      if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-vehicle-targets-')) throw new Error('Unsafe cleanup path');
      await rm(target, { recursive: true, force: true });
    }
  });

  test('the rig uses this repository when available and an explicit fallback otherwise', () => {
    const site = resolve('fixture/site');
    expect(resolveRigEngine({ site, env: {}, exists: () => true })).toBe(resolve(site, '..'));
    expect(resolveRigEngine({ site, env: { KILN_RIG_ENGINE_DIR: 'override' }, exists: () => false })).toBe(resolve('override'));
    expect(() => resolveRigEngine({ site, env: {}, exists: () => false })).toThrow('KILN_RIG_ENGINE_DIR');
  });
});

describe('poster run provenance', () => {
  const rigFor = (commit: string, instance: string) => ({
    engine: { provenance: { commit, subject: `engine at ${commit.slice(0, 7)}`, dirty: false } },
    service: { url: 'http://127.0.0.1:8000', protocol: 'kiln.render-service.v2', captureIdentity: ['kiln.capture-producer.v1', instance] },
  });
  const png = Buffer.from('png');
  const rendered = (pack: string, release: string, slug: string) => [{
    png,
    target: { pack, slug, alt: `A ${slug}.` },
    record: { path: rigPosterPath(pack, release, slug), width: 8, height: 8, bytes: png.length, sha256: hashBytes(png), revisionId: `r_${slug}` },
  }];

  /** A data directory as the pipeline keeps it, plus a mirror to pin into. */
  async function workspace(seed: object = { schemaVersion: 1, rig: {}, posters: {} }) {
    const root = await mkdtemp(join(tmpdir(), 'kiln-rig-runs-'));
    const data = join(root, 'data');
    await mkdir(data, { recursive: true });
    await writeFile(join(data, 'mirror-manifest.json'), JSON.stringify({ files: [] }));
    await writeFile(join(data, 'commons-build.json'), JSON.stringify({ images: [] }));
    await writeFile(join(data, 'rig-posters.json'), JSON.stringify(seed));
    return { root, data, mirror: join(root, 'mirror'), read: async () => JSON.parse(await readFile(join(data, 'rig-posters.json'), 'utf8')) };
  }

  test('each run keeps its own record and every poster names the run that made it', async () => {
    const w = await workspace();
    try {
      await recordPosters({ rig: rigFor('a'.repeat(40), 'one'), rendered: rendered('holodeck', 'rel-01', 'shell'), mirror: w.mirror, data: w.data, renderedOn: '2026-10-25' });
      await recordPosters({ rig: rigFor('b'.repeat(40), 'two'), rendered: rendered('holodeck', 'rel-02', 'palm'), mirror: w.mirror, data: w.data, renderedOn: '2026-10-26' });
      const recorded = await w.read();
      expect(recorded.rig.runs).toHaveLength(2);
      // The earlier run's provenance survives the later one: this is what a single per-pack record overwrote.
      expect(recorded.rig.runs[0]).toMatchObject({ pack: 'holodeck', renderedOn: '2026-10-25', engine: { commit: 'a'.repeat(40) } });
      expect(recorded.rig.runs[1]).toMatchObject({ pack: 'holodeck', renderedOn: '2026-10-26', engine: { commit: 'b'.repeat(40) } });
      expect(recorded.posters['holodeck:shell'].run).toBe(recorded.rig.runs[0].id);
      expect(recorded.posters['holodeck:palm'].run).toBe(recorded.rig.runs[1].id);
      // Re-rendering under the same engine, service and day is the same run, not another record.
      await recordPosters({ rig: rigFor('b'.repeat(40), 'two'), rendered: rendered('holodeck', 'rel-02', 'shell'), mirror: w.mirror, data: w.data, renderedOn: '2026-10-26' });
      const again = await w.read();
      expect(again.rig.runs.map((run: { id: string }) => run.id)).toEqual(recorded.rig.runs.map((run: { id: string }) => run.id));
      expect(again.posters['holodeck:shell'].run).toBe(again.rig.runs[1].id);
    } finally { await rm(w.root, { recursive: true, force: true }); }
  });

  test('a one-record-per-pack header migrates to one record per run', async () => {
    const legacy = { schemaVersion: 1, rig: { id: RIG_ID, backdrop: 'neutral', runs: { farm: { renderedOn: '2026-10-01', engine: { commit: 'c'.repeat(40), subject: 'farm', dirty: true }, service: { url: 'http://127.0.0.1:8000' } } } }, posters: {} };
    const w = await workspace(legacy);
    try {
      await recordPosters({ rig: rigFor('d'.repeat(40), 'three'), rendered: rendered('holodeck', 'rel-01', 'shell'), mirror: w.mirror, data: w.data, renderedOn: '2026-10-26' });
      const recorded = await w.read();
      expect(recorded.rig.runs.map((run: { pack: string }) => run.pack)).toEqual(['farm', 'holodeck']);
      expect(recorded.rig.runs[0]).toMatchObject({ renderedOn: '2026-10-01', engine: { commit: 'c'.repeat(40) } });
      for (const run of recorded.rig.runs) expect(run.id).toMatch(/^[a-z-]+-2026-10-\d\d-[0-9a-f]{8}$/);
    } finally { await rm(w.root, { recursive: true, force: true }); }
  });
});

describe('the bridge views without the author capture files', () => {
  test('reuse each view’s recorded camera and its source file hash, for the newly pinned full tier', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-bridge-recorded-'));
    try {
      const glb = Buffer.from('full tier export');
      await writeFile(join(root, 'golden-gate.glb'), glb);
      const tiers = { assetId: 'a_bridge', tiers: [{ tier: 'full', revision: 'r_child', glb: { file: 'golden-gate.glb', bytes: glb.length, sha256: hashBytes(glb) } }] };
      const camera = (name: string) => ({ version: 'kiln.camera.v1', projection: 'perspective', position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], aspect: 1, near: 0.5, far: 100, fovDeg: name.length });
      const posters = Object.fromEntries(BRIDGE_CAPTURES.map((capture) => [bridgeCaptureKey(capture), { revisionId: 'r_parent', width: 1024, height: 1024, view: { camera: camera(capture.name), source: { file: `${capture.name}.json`, sha256: 'f'.repeat(64) } } }]));
      const targets = await bridgeTargets({ outputs: root, recorded: { posters }, tiers });
      expect(targets.map((target) => target.capture)).toEqual(BRIDGE_CAPTURES.map((capture) => capture.name));
      for (const target of targets) {
        expect(target.revisionId).toBe('r_child');
        expect(target.path).toBe(bridgeCapturePath('r_child', target.capture));
        expect(target.camera).toEqual(camera(target.capture));
        expect(target.cameraSource).toEqual({ file: `${target.capture}.json`, sha256: 'f'.repeat(64) });
        expect(target.view).toEqual({ width: 1024, height: 1024 });
        expect(Buffer.from(target.glb).equals(glb)).toBe(true);
      }
      delete posters[bridgeCaptureKey(BRIDGE_CAPTURES[1]!)].view.camera;
      await expect(bridgeTargets({ outputs: root, recorded: { posters }, tiers })).rejects.toThrow(/water-level has no recorded camera/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
describe('a Farm asset delivered as its own model file', () => {
  test('is read from the mirror at its path, verified, and posted under its own delivery release', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-farm-path-'));
    try {
      const glb = Buffer.from('fixed farmer');
      const path = 'packs/farm/delivery-new/models/farmer.glb';
      await mkdir(join(root, 'mirror', 'packs/farm/delivery-new/models'), { recursive: true });
      await writeFile(join(root, 'mirror', path), glb);
      await mkdir(join(root, 'data', 'packs'), { recursive: true });
      const farmer = { slug: 'farmer', name: 'Farmer', revisionId: 'r_new', assetId: 'a_farmer', description: 'Farmer.', runtimeDownload: { path, url: `https://assets.kilnstudio.tools/${path}`, bytes: glb.length, sha256: hashBytes(glb) } };
      await writeFile(join(root, 'data', 'packs/farm.json'), JSON.stringify({ revision: 'r36', assets: [farmer] }));
      await writeFile(join(root, 'data', 'mirror-manifest.json'), JSON.stringify({ files: [{ path, bytes: glb.length, sha256: hashBytes(glb) }] }));
      const [target] = await farmTargets({ mirror: join(root, 'mirror'), data: join(root, 'data') });
      expect(target).toMatchObject({ pack: 'farm', release: 'delivery-new', slug: 'farmer', revisionId: 'r_new', glbPath: path });
      expect(Buffer.from(target!.glb).equals(glb)).toBe(true);
      await writeFile(join(root, 'mirror', path), 'tampered');
      await expect(farmTargets({ mirror: join(root, 'mirror'), data: join(root, 'data') })).rejects.toThrow(/verification failed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
describe('Seed Town kit posters', () => {
  test('target every catalog kit with its sealed carried model, framed on what it shows, and refuse changed bytes', async () => {
    const catalog = await json('packs/seed-town.json');
    const root = await mkdtemp(join(tmpdir(), 'seed-town-posters-'));
    try {
      await mkdir(join(root, 'data/packs'), { recursive: true });
      await mkdir(join(root, 'assets/models'), { recursive: true });
      // The staged pack is not in the repository: stand in a model for each kit and seal the catalog copy to it.
      const assets = [];
      for (const asset of catalog.assets) {
        const bytes = Buffer.from(`carried ${asset.slug}`);
        await writeFile(join(root, 'assets', asset.runtimeModelDownload.member), bytes);
        assets.push({ ...asset, runtimeModelDownload: { ...asset.runtimeModelDownload, bytes: bytes.length, sha256: hashBytes(bytes) } });
      }
      await writeFile(join(root, 'data/packs/seed-town.json'), JSON.stringify({ ...catalog, assets }));
      const targets = await seedTownTargets({ assetsDir: join(root, 'assets'), data: join(root, 'data') });
      expect(targets.map((target: { slug: string }) => target.slug)).toEqual(catalog.assets.map((asset: { slug: string }) => asset.slug));
      for (const target of targets) {
        const asset = assets.find((candidate) => candidate.slug === target.slug);
        expect(target).toMatchObject({ pack: SEED_TOWN_ID, release: catalog.release, revisionId: asset.revisionId, assetId: asset.assetId, glbPath: `models/${asset.slug}.glb`, alt: asset.description, visibleOnly: true });
        expect(hashBytes(target.glb)).toBe(asset.runtimeModelDownload.sha256);
      }
      await writeFile(join(root, 'assets', assets[0].runtimeModelDownload.member), 'tampered');
      await expect(seedTownTargets({ assetsDir: join(root, 'assets'), data: join(root, 'data') })).rejects.toThrow(/verification failed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('H-7 posters', () => {
  test('target every catalog model from the staged mirror, and refuse changed bytes', async () => {
    const catalog = await json('packs/h-7.json');
    const root = await mkdtemp(join(tmpdir(), 'h7-posters-'));
    try {
      const models = join(root, 'mirror/packs', H7_ID, catalog.release, 'models');
      await mkdir(join(root, 'data/packs'), { recursive: true });
      await mkdir(models, { recursive: true });
      // The staged mirror is not in the repository: stand in a model for each asset and seal the catalog copy to it.
      const assets = [];
      for (const asset of catalog.assets) {
        const bytes = Buffer.from(`saved ${asset.slug}`);
        await writeFile(join(models, `${asset.slug}.glb`), bytes);
        assets.push({ ...asset, runtimeModelDownload: { ...asset.runtimeModelDownload, bytes: bytes.length, sha256: hashBytes(bytes) } });
      }
      await writeFile(join(root, 'data/packs/h-7.json'), JSON.stringify({ ...catalog, assets }));
      const targets = await h7Targets({ mirror: join(root, 'mirror'), data: join(root, 'data') });
      expect(targets.map((target: { slug: string }) => target.slug)).toEqual(catalog.assets.map((asset: { slug: string }) => asset.slug));
      for (const target of targets) {
        const asset = assets.find((candidate) => candidate.slug === target.slug);
        expect(target).toMatchObject({ pack: H7_ID, release: catalog.release, revisionId: asset.revisionId, assetId: asset.assetId, glbPath: `models/${asset.slug}.glb`, alt: asset.description });
        expect(hashBytes(target.glb)).toBe(asset.runtimeModelDownload.sha256);
      }
      await writeFile(join(models, `${assets[0].slug}.glb`), 'tampered');
      await expect(h7Targets({ mirror: join(root, 'mirror'), data: join(root, 'data') })).rejects.toThrow(/verification failed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
