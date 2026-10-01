import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { archiveProfile, hashBytes, verifyArchive } from './mirror-core.mjs';
import { parseSums } from './scene-pack.mjs';
import { RUNTIME_ARCHIVE_PATH, buildRuntimeArchive, stageVehicles, storedZip, vehicleFiles, vehicleReview, verifyVehicle, zipTime } from './stage-vehicles.mjs';
import { VEHICLES, VEHICLE_DOCUMENTS } from './vehicles-spec.mjs';
import { sha, writeFixture, type WriteOptions, type WrittenFixture } from './vehicle-test-fixtures';

async function withFixture<T>(options: WriteOptions, run: (fixture: WrittenFixture) => Promise<T>): Promise<T> {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-vehicles-'));
  try {
    return await run(await writeFixture(temp, options));
  } finally {
    const target = resolve(temp);
    if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-vehicles-')) throw new Error('Unsafe cleanup path');
    await rm(target, { recursive: true, force: true });
  }
}

async function verify(fixture: WrittenFixture, vehicle = fixture.vehicles[0]!) {
  const sums = parseSums(await readFile(join(fixture.scenePack, 'SHA256SUMS'), 'utf8'));
  return verifyVehicle({ vehicle, commons: fixture.commons, scenePack: fixture.scenePack, sums, runs: fixture.runs });
}

const revisionDir = (fixture: WrittenFixture, revisionId: string) => join(fixture.commons, 'showcase/authors', fixture.vehicles[0]!.author, 'assets/kiln', fixture.vehicles[0]!.assetId, 'revisions', revisionId);
const readJsonFile = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const writeJsonFile = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

describe('an accepted vehicle', () => {
  test('is verified against the library, the scene pack and its own tiers, and built into deterministic archives', async () => {
    await withFixture({}, async (fixture) => {
      const result = await verify(fixture);
      expect(result.top.revisionId).toBe('r_00000000000000000000000000000001');
      expect(result.measured.form).toBe('MSFT_lod');
      expect(result.measured.tiers.map((tier) => tier.bodyTriangles)).toEqual([130, 20, 5]);
      expect(result.geometryUnchanged).toBeNull();
      // The editable archive holds the four members of the saved revision, sealed by its own manifest.
      const archive = verifyArchive(result.zip, 'editable');
      expect(archive.prefix).toBe('fixture-sedan/r_00000000000000000000000000000001/');
      expect(Object.keys(archive.files).sort()).toEqual(['fixture-sedan/r_00000000000000000000000000000001/asset.glb', 'fixture-sedan/r_00000000000000000000000000000001/manifest.json', 'fixture-sedan/r_00000000000000000000000000000001/preview.png', 'fixture-sedan/r_00000000000000000000000000000001/source.kiln.js']);
      // Same inputs, same bytes.
      expect(hashBytes((await verify(fixture)).zip)).toBe(hashBytes(result.zip));
      // The licence text is the scene pack's own, byte for byte.
      expect(result.licence.text).toContain('SPDX-License-Identifier: CC0-1.0');
    });
  });

  test('a correction is compared with the revision it follows', async () => {
    await withFixture({ corrected: true }, async (fixture) => {
      const same = await verify(fixture);
      expect(same.revisions).toHaveLength(2);
      expect(same.geometryUnchanged).toBe(true);
      expect(vehicleReview(same.vehicle, same)).toMatchObject({ status: 'awaiting-owner-review', ownerAccepted: false });
      expect(vehicleReview(same.vehicle, same).correction).toContain('equal the first revision');
    });
    await withFixture({ corrected: true, firstPaintTriangles: 90 }, async (fixture) => {
      const changed = await verify(fixture);
      expect(changed.geometryUnchanged).toBe(false);
      // The site does not claim what it did not measure.
      expect(vehicleReview(changed.vehicle, changed).correction).not.toContain('equal the first revision');
      expect(vehicleReview(changed.vehicle, changed).correction).toContain('Approval of the corrected revision is not recorded.');
    });
  });

  test('a corrected revision counts as approved only by an approval that names that revision', async () => {
    await withFixture({ corrected: true }, async (fixture) => {
      const result = await verify(fixture);
      const approval = { recordedAt: '2026-09-30', statement: 'The owner approved the corrected revision on 30 September 2026.', source: 'fixture decision' };
      const top = result.vehicle.revisions.at(-1)!.revisionId;
      const approved = vehicleReview(result.vehicle, { ...result, approvals: { [top]: approval } });
      expect(approved).toMatchObject({ status: 'accepted', ownerAccepted: true, recordedAt: '2026-09-30', source: 'fixture decision' });
      expect(approved.scope.startsWith('The owner approved all six vehicles at every tier on 29 September 2026. ')).toBe(true);
      expect(approved.correction.endsWith('equal the first revision’s at every tier. The owner approved the corrected revision on 30 September 2026.')).toBe(true);
      expect(approved.correction).not.toContain('not recorded');
      // An approval of the revision it corrects does not carry over to the correction.
      const earlier = vehicleReview(result.vehicle, { ...result, approvals: { [result.vehicle.revisions[0]!.revisionId]: approval } });
      expect(earlier).toMatchObject({ status: 'awaiting-owner-review', ownerAccepted: false });
    });
  });
});

describe('a vehicle is refused when its inputs disagree', () => {
  const refused = async (options: WriteOptions, message: string | RegExp, tamper?: (fixture: WrittenFixture) => Promise<void>) => {
    await withFixture(options, async (fixture) => {
      await tamper?.(fixture);
      await expect(verify(fixture)).rejects.toThrow(message);
    });
  };

  test('a delivered binary chunk that differs from the saved export', async () => {
    await refused({ deliveredBin: Buffer.alloc(64, 1) }, "binary chunk differs from the saved revision's asset.glb");
  });

  test('a delivered GLB that differs from the licence text, the SHA256SUMS or the scene pack\'s copy', async () => {
    await refused({ licenceGlbSha: sha('another file') }, /licence text states GLB [0-9a-f]{64}, the delivered export is/);
    await refused({}, "the scene pack's SHA256SUMS seals a different GLB", async ({ scenePack }) => {
      const sums = await readFile(join(scenePack, 'SHA256SUMS'), 'utf8');
      await writeFile(join(scenePack, 'SHA256SUMS'), sums.replace(/^[0-9a-f]{64}/, sha('x')));
    });
    await refused({}, "the scene pack's copy differs from the delivered export", async ({ scenePack }) => {
      await writeFile(join(scenePack, 'vehicles/sedan.glb'), Buffer.from('another file'));
    });
    await refused({}, "the licence text is not the one the scene pack's SHA256SUMS seals", async ({ scenePack }) => {
      // The same statements with one more line: every field checks out, but the bytes are not the sealed ones.
      const path = join(scenePack, 'licenses/vehicles/sedan.ASSET-LICENSE.txt');
      await writeFile(path, `${await readFile(path, 'utf8')}Edited after sealing.\n`);
    });
  });

  test('licence text that does not state CC0, the asset or the saved revision', async () => {
    const rewrite = (change: (text: string) => string) => async ({ scenePack }: WrittenFixture) => {
      const path = join(scenePack, 'licenses/vehicles/sedan.ASSET-LICENSE.txt');
      const text = change(await readFile(path, 'utf8'));
      await writeFile(path, text);
      // Keep the seal honest so the licence check, not the seal, is what refuses.
      const sumsPath = join(scenePack, 'SHA256SUMS');
      const sums = (await readFile(sumsPath, 'utf8')).replace(/^[0-9a-f]{64}(  licenses\/vehicles\/sedan\.ASSET-LICENSE\.txt)$/m, `${sha(text)}$1`);
      await writeFile(sumsPath, sums);
    };
    await refused({}, 'does not state SPDX CC0-1.0', rewrite((text) => text.replace('CC0-1.0', 'CC-BY-4.0')));
    await refused({}, 'the licence text names asset another-asset', rewrite((text) => text.replace('fixture-sedan', 'another-asset')));
    await refused({}, /the licence text names revision r_0+9, not r_0+1/, rewrite((text) => text.replace('r_00000000000000000000000000000001', 'r_00000000000000000000000000000009')));
  });

  test('a saved revision whose sealed file, dependencies or window do not hold', async () => {
    await refused({}, /SHA-256\/size verification failed for sedan source\.kiln\.js/, async (fixture) => {
      await writeFile(join(revisionDir(fixture, 'r_00000000000000000000000000000001'), 'source.kiln.js'), 'changed');
    });
    await refused({ dependencies: [{ name: 'imported-model' }] }, 'lists dependencies');
    await refused({ savedAt: '2026-09-29T15:10:00.000Z' }, /was saved at 2026-09-29T15:10:00\.000Z, outside run first-retry1/);
    await refused({ savedAt: '2026-09-29T13:50:00.000Z' }, /outside run first-retry1/);
  });

  test('a revision that is not the one expected, or whose attribution or run is not recorded', async () => {
    await refused({}, /the library holds r_0+7/, async (fixture) => {
      const path = join(revisionDir(fixture, 'r_00000000000000000000000000000001'), 'manifest.json');
      await writeJsonFile(path, { ...(await readJsonFile(path)), revisionId: 'r_00000000000000000000000000000007' });
    });
    await refused({}, 'is attributed to another-model, but run first-retry1 asked for claude-sonnet-5-5', async (fixture) => {
      const path = join(revisionDir(fixture, 'r_00000000000000000000000000000001'), 'manifest.json');
      const manifest = await readJsonFile(path);
      await writeJsonFile(path, { ...manifest, attribution: { ...manifest.attribution, model: 'another-model' } });
    });
    await withFixture({}, async (fixture) => {
      const vehicle = { ...fixture.vehicles[0]!, revisions: [{ ...fixture.vehicles[0]!.revisions[0]!, run: 'not-a-run' }] };
      await expect(verify(fixture, vehicle)).rejects.toThrow('no recorded run fixture-author/not-a-run');
    });
  });

  test('a correction that does not follow its parent, or whose parent does not seal its GLB', async () => {
    await refused({ corrected: true }, /r_0+2 does not follow r_0+1/, async (fixture) => {
      const path = join(revisionDir(fixture, 'r_00000000000000000000000000000002'), 'manifest.json');
      await writeJsonFile(path, { ...(await readJsonFile(path)), parentRevision: 'r_00000000000000000000000000000009' });
      fixture.vehicles[0]!.revisions[1]!.parentRevisionId = 'r_00000000000000000000000000000009';
    });
    await refused({ corrected: true }, /does not seal asset\.glb/, async (fixture) => {
      const path = join(revisionDir(fixture, 'r_00000000000000000000000000000001'), 'manifest.json');
      const manifest = await readJsonFile(path);
      delete manifest.files['asset.glb'];
      await writeJsonFile(path, manifest);
    });
  });

  test('a delivered export that is not the rewrite it must be', async () => {
    await refused({ deliveredForm: 'named-groups' }, 'the delivered export is not an MSFT_lod file (named-groups)');
    await refused({ extensionsRequired: ['MSFT_lod'] }, 'the delivered export requires MSFT_lod');
    await withFixture({}, async (fixture) => {
      await expect(verify(fixture, { ...fixture.vehicles[0]!, root: 'Truck' })).rejects.toThrow('the root node is Car, not Truck');
    });
  });

  test('tiers that differ between the delivered export and the saved revision', async () => {
    await refused({ deliveredPaintTriangles: 101 }, 'LOD0 differs between the delivered export and the saved revision');
  });

  test('a tier over its triangle budget', async () => {
    await refused({ paintTriangles: 12000, deliveredPaintTriangles: 12000 }, /LOD0 has 12030 triangles, over its budget of 12000/);
  });

  test('wheels that do not drop out where the last tier starts', async () => {
    await refused({ wheelsHidden: false }, /the wheels do not drop out where LOD2 starts/);
    await refused({ wheelsHideAt: 400 }, /the wheels do not drop out where LOD2 starts \(they hide beyond 400 m, the tier starts at 250 m\)/);
    await refused({ wheelsHideAt: 100 }, /the wheels do not drop out where LOD2 starts/);
  });
});

describe('the pack archive', () => {
  test('holds the GLBs and licence texts under an inventory of their hashes, and is deterministic', async () => {
    await withFixture({}, async (fixture) => {
      const result = await verify(fixture);
      const zip = buildRuntimeArchive([result]);
      expect(hashBytes(buildRuntimeArchive([result]))).toBe(hashBytes(zip));
      const files = unzipSync(zip);
      expect(Object.keys(files)).toEqual(['delivery.json', 'models/sedan.glb', 'licenses/sedan.ASSET-LICENSE.txt']);
      const inventory = JSON.parse(new TextDecoder().decode(files['delivery.json']));
      expect(inventory).toMatchObject({ schemaVersion: 1, profile: 'runtime', release: 'r2', license: 'CC0-1.0' });
      expect(inventory.files['models/sedan.glb']).toEqual({ bytes: fixture.glb.length, sha256: sha(fixture.glb) });
      expect(inventory.assets[0]).toMatchObject({ slug: 'sedan', revisionId: 'r_00000000000000000000000000000001', model: 'models/sedan.glb' });
      expect(inventory.assets[0].tiers.map((tier: { tier: string; triangles: number }) => [tier.tier, tier.triangles])).toEqual([['LOD0', 210], ['LOD1', 100], ['LOD2', 5]]);
      expect(verifyArchive(zip, 'delivery').manifest.files['models/sedan.glb'].sha256).toBe(sha(fixture.glb));
    });
  });

  test('is classified by where it sits: editable archives are sealed by their revision manifest', () => {
    expect(archiveProfile(vehicleFiles('sedan').editable)).toBe('editable');
    expect(archiveProfile(RUNTIME_ARCHIVE_PATH)).toBe('delivery');
    expect(archiveProfile('packs/farm/r34/farm-runtime.zip')).toBe('delivery');
    expect(archiveProfile('standalone/golden-gate-bridge/r_x/golden-gate-bridge-editable.zip')).toBe('editable');
  });
});

describe('archive time', () => {
  test('zipTime carries the UTC fields as local fields', () => {
    const time = zipTime(new Date('2026-09-29T15:07:44Z'));
    expect([time.getFullYear(), time.getMonth() + 1, time.getDate(), time.getHours(), time.getMinutes(), time.getSeconds()]).toEqual([2026, 9, 29, 15, 7, 44]);
  });

  test('the DOS time in the archive header is the UTC time of the revision, whatever the machine\'s zone', () => {
    const zip = storedZip({ 'a.txt': Buffer.from('a') }, new Date('2026-09-29T15:07:44Z'));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const time = zip.readUInt16LE(10);
    const date = zip.readUInt16LE(12);
    expect([(time >> 11) & 31, (time >> 5) & 63, (time & 31) * 2]).toEqual([15, 7, 44]);
    expect([((date >> 9) & 127) + 1980, (date >> 5) & 15, date & 31]).toEqual([2026, 9, 29]);
    // Stored, not compressed: the member's bytes are in the archive as they are.
    expect(zip.readUInt16LE(8)).toBe(0);
  });
});

describe('staging into the mirror, the manifest, the plan and the catalog', () => {
  const stage = (fixture: WrittenFixture) => stageVehicles({ commons: fixture.commons, scenePack: fixture.scenePack, mirror: fixture.mirror, data: fixture.data, vehicles: fixture.vehicles, documents: [], log: () => {} });
  const state = async (fixture: WrittenFixture) => ({
    manifest: await readFile(join(fixture.data, 'mirror-manifest.json'), 'utf8'),
    plan: await readFile(join(fixture.data, 'commons-build.json'), 'utf8'),
    catalog: await readFile(join(fixture.data, 'packs/vehicles.json'), 'utf8'),
  });

  test('pins every file, extends the plan and writes the catalog; a repeated run changes nothing', async () => {
    await withFixture({}, async (fixture) => {
      const first = await stage(fixture);
      expect(first.pins.map((pin) => pin.path).sort()).toEqual([
        'media/vehicles/r2/review/sedan.png',
        'packs/vehicles/r2/editable/sedan-editable.zip',
        'packs/vehicles/r2/generic-road-vehicles-runtime.zip',
        'packs/vehicles/r2/licenses/sedan.ASSET-LICENSE.txt',
        'packs/vehicles/r2/models/sedan.glb',
      ]);
      for (const pin of first.pins) expect(hashBytes(await readFile(join(fixture.mirror, pin.path)))).toBe(pin.sha256);
      const manifest = await readJsonFile(join(fixture.data, 'mirror-manifest.json'));
      // The Farm pin already in the manifest stays; the five new ones are added.
      expect(manifest.files.map((file: { path: string }) => file.path)).toContain('packs/farm/keep.bin');
      expect(manifest.files).toHaveLength(6);
      const plan = await readJsonFile(join(fixture.data, 'commons-build.json'));
      expect(plan.archives).toEqual(['packs/farm/keep.zip', RUNTIME_ARCHIVE_PATH, vehicleFiles('sedan').editable]);
      expect(plan.models).toEqual([{ path: 'packs/vehicles/r2/models/sedan.glb', output: 'models/vehicles/sedan.glb', bytes: fixture.glb.length, sha256: sha(fixture.glb) }]);
      expect(plan.sources).toHaveLength(1);
      expect(plan.sources[0]).toMatchObject({ archive: vehicleFiles('sedan').editable, member: 'fixture-sedan/r_00000000000000000000000000000001/source.kiln.js', output: 'sources/vehicles/sedan.kiln.js' });
      expect(plan.images.map((image: { inputPath: string }) => image.inputPath)).toEqual(['media/vehicles/r2/review/sedan.png']);
      const catalog = await readJsonFile(join(fixture.data, 'packs/vehicles.json'));
      expect(catalog).toMatchObject({ id: 'vehicles', assetCount: 1, license: 'CC0-1.0' });
      expect(catalog.assets[0]).toMatchObject({ slug: 'sedan', pack: 'vehicles', category: 'Cars', modelPath: '/models/vehicles/sedan.glb', sourcePath: '/sources/vehicles/sedan.kiln.js' });
      expect(catalog.assets[0].metrics.triangles).toBe(210);
      expect(catalog.assets[0].vehicle).toMatchObject({ wheelbase: 2.6, frontTrack: 1.6, rearTrack: 1.6, wheelRadius: 0.3, dualRear: false });
      expect(catalog.assets[0].review).toMatchObject({ status: 'accepted', ownerAccepted: true });
      expect(catalog.assets[0].runtimeDownload).toMatchObject({ archive: RUNTIME_ARCHIVE_PATH, member: 'models/sedan.glb', form: 'MSFT_lod', sha256: sha(fixture.glb) });
      expect(catalog.assets[0].editableDownload.glbForm).toBe('named-groups');
      expect(catalog.assets[0].licence.statesDeliveredGlbSha256).toBe(sha(fixture.glb));
      expect(catalog.ownerReview).toMatchObject({ acceptedAssets: 1, total: 1, status: 'all-current-revisions-accepted' });
      expect(catalog.downloads[0]).toMatchObject({ profile: 'runtime', assets: 1, files: 3, path: RUNTIME_ARCHIVE_PATH });
      expect(catalog.assets[0].poster).toBeNull();

      const before = await state(fixture);
      const second = await stage(fixture);
      expect(await state(fixture)).toEqual(before);
      expect(second.pins).toEqual(first.pins);
    });
  });

  test('removes entries of vehicles no longer in the pack and leaves other packs\' entries alone', async () => {
    await withFixture({}, async (fixture) => {
      const manifestFile = join(fixture.data, 'mirror-manifest.json');
      const planFile = join(fixture.data, 'commons-build.json');
      const manifest = await readJsonFile(manifestFile);
      manifest.files.push({ path: 'packs/vehicles/r2/models/old.glb', bytes: 1, sha256: sha('old') }, { path: 'media/vehicles/r2/review/old.png', bytes: 1, sha256: sha('old') });
      await writeJsonFile(manifestFile, manifest);
      const plan = await readJsonFile(planFile);
      plan.models.push({ path: 'packs/vehicles/r2/models/old.glb', output: 'models/vehicles/old.glb', bytes: 1, sha256: sha('old') }, { path: 'packs/farm/r34/x.glb', output: 'models/farm/x.glb', bytes: 1, sha256: sha('x') });
      plan.images.push({ inputPath: 'media/vehicles/r2/review/old.png', src: '/media/vehicles/r2/review/old.webp', width: 1, height: 1 });
      await writeJsonFile(planFile, plan);
      await stage(fixture);
      const after = await readJsonFile(manifestFile);
      expect(after.files.some((file: { path: string }) => file.path.includes('old'))).toBe(false);
      expect(after.files.some((file: { path: string }) => file.path === 'packs/farm/keep.bin')).toBe(true);
      const planAfter = await readJsonFile(planFile);
      expect(planAfter.models.map((model: { output: string }) => model.output)).toEqual(['models/farm/x.glb', 'models/vehicles/sedan.glb']);
      expect(planAfter.images.some((image: { inputPath: string }) => image.inputPath.includes('old'))).toBe(false);
    });
  });

  test('refuses a scene pack that is not the one the site recorded', async () => {
    await withFixture({ recordSums: sha('a different scene pack') }, async (fixture) => {
      await expect(stage(fixture)).rejects.toThrow(/SHA256SUMS \([0-9a-f]{12}\) is not the one the site recorded for golden-gate \([0-9a-f]{12}\); stage that pack first/);
      // Nothing is written when the inputs disagree.
      await expect(readFile(join(fixture.data, 'packs/vehicles.json'))).rejects.toThrow();
    });
  });

  test('a vehicle that fails verification stops the run before anything is pinned', async () => {
    await withFixture({ wheelsHidden: false }, async (fixture) => {
      await expect(stage(fixture)).rejects.toThrow('the wheels do not drop out');
      const manifest = await readJsonFile(join(fixture.data, 'mirror-manifest.json'));
      expect(manifest.files).toHaveLength(1);
      await expect(readFile(join(fixture.mirror, vehicleFiles('sedan').glb))).rejects.toThrow();
    });
  });
});

describe('the pack specification', () => {
  test('names six vehicles with distinct slugs, assets and budget classes', () => {
    expect(VEHICLES.map((vehicle) => vehicle.slug)).toEqual(['hatchback', 'sedan', 'suv', 'pickup', 'box-truck', 'transit-bus']);
    expect(new Set(VEHICLES.map((vehicle) => vehicle.assetId)).size).toBe(6);
    expect(VEHICLES.map((vehicle) => vehicle.category)).toEqual(['Cars', 'Cars', 'Cars', 'Trucks', 'Trucks', 'Buses']);
    expect(VEHICLES.map((vehicle) => vehicle.budget)).toEqual(['car', 'car', 'car', 'car', 'heavy', 'heavy']);
    // Only the bus was corrected after the owner's approval was recorded.
    expect(VEHICLES.filter((vehicle) => vehicle.revisions.length > 1).map((vehicle) => vehicle.slug)).toEqual(['transit-bus']);
    for (const vehicle of VEHICLES) {
      expect(vehicle.revisions[0]!.parentRevisionId).toBeNull();
      // Each description comes from the vehicle's own brief and carries no brand, badge, text or livery.
      expect(vehicle.description.length).toBeGreaterThan(40);
    }
  });

  test('cites the brief, the reports, the LOD convention and the writer as documents', () => {
    expect(VEHICLE_DOCUMENTS.map((document) => document.role).length).toBeGreaterThanOrEqual(4);
    for (const document of VEHICLE_DOCUMENTS) expect(document.path).not.toStartWith('/');
  });
});
