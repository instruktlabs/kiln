import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RIG_ID, resolveRigEngine, fitCamera, orbitDirection } from './rig-render.mjs';
import { applyRigPoster, applyRigPosters, rigPosterImage, rigPosterKey, rigPosterPath } from './rig-posters-core.mjs';
import { VEHICLE_POSTER, pruneImagePlan, vehicleTargets } from './rig-posters.mjs';
import { hashBytes } from './mirror-core.mjs';

const DATA = resolve(import.meta.dir, '../src/data');
const json = async (file: string) => JSON.parse(await readFile(join(DATA, file), 'utf8'));

const record = {
  path: 'media/rig/review-neutral-v1/farm/r34/barn.png',
  width: 1024,
  height: 1024,
  revisionId: 'r_barn',
};
const asset = { slug: 'barn', revisionId: 'r_barn', description: 'Red barn.', poster: { alt: 'Old alt', inputPath: 'media/farm/r33/cutout/barn.webp', revisionQualification: 'Exterior view from r33.', exactRevision: false } };

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
    expect(recorded.rig.runs.farm.engine.commit).toMatch(/^[0-9a-f]{40}$/);
    const pins = new Map<string, { path: string; bytes: number; sha256: string }>(manifest.files.map((file: { path: string; bytes: number; sha256: string }) => [file.path, file]));
    const planned = new Set(plan.images.map((image: { inputPath: string }) => image.inputPath));
    expect(farm.assets).toHaveLength(23);
    for (const item of farm.assets) {
      const poster = recorded.posters[rigPosterKey('farm', item.slug)];
      expect(poster, item.slug).toBeDefined();
      expect(poster.revisionId).toBe(item.revisionId);
      expect(poster.glb.sha256).toBe(item.runtimeDownload.sha256);
      expect(poster.glb.member).toBe(item.runtimeDownload.member);
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
    expect(recorded.rig.runs.vehicles.engine.commit).toBe(recorded.rig.runs.farm.engine.commit);
    // All six final posters must bind the newly delivered runtime, independently of saved-preview canonical bytes.
    expect(recorded.rig.runs.vehicles.engine).toMatchObject({ commit: 'ac6d9eb492b4891a54dbf563cfef14af5633254a', dirty: true });
    expect(recorded.rig.runs.vehicles.service).toMatchObject({
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
      expect(vehicles.release).toBe('r4-local-review');
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
