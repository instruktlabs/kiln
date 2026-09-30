import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { inspectGlb } from './generate-commons.mjs';
import { BRIDGE_CAPTURES, BRIDGE_ID, bridgeCaptureKey, bridgeCapturePath, cameraFromCaptureFile } from './bridge-captures.mjs';
import { pinMirrorFile, readJson, upsertBy, writeJson } from './media-pins.mjs';
import { verifyArchive, verifyBytes } from './mirror-core.mjs';
import { RIG_ID, connectRig, fitCamera, orbitDirection, sha256Of } from './rig-render.mjs';
import { applyRigPosters, rigPosterImage, rigPosterKey, rigPosterPath } from './rig-posters-core.mjs';
import { FOUNDRY_FLOOR_ID, FOUNDRY_FLOOR_POSTER, FOUNDRY_FLOOR_SCENE_POSTER } from './foundry-floor-spec.mjs';

/**
 * Re-render the poster of every asset of a pack under the review rig and record the result:
 *
 *   bun scripts/rig-posters.mjs farm   --service http://127.0.0.1:8123 --mirror C:/.../mirror [--only barn,cow] [--out DIR]
 *   bun scripts/rig-posters.mjs bridge --service ... --mirror ... --outputs DIR --cameras DIR [--out DIR]
 *   bun scripts/rig-posters.mjs vehicles --service ... --mirror C:/.../mirror [--only sedan,suv] [--out DIR]
 *   bun scripts/rig-posters.mjs foundry-floor --service ... --mirror C:/.../mirror [--only foup,scene-poster] [--out DIR]
 *
 * Each GLB is read from its sealed source (a delivery archive in the mirror, or the bridge author's export) and
 * verified against the catalog's SHA-256 before it is sent to the renderer. An image is the engine's own view of
 * that exact GLB, nothing composited or retouched. Farm, vehicle and Foundry Floor posters are pinned in the mirror and
 * planned here (the Foundry Floor scene page's poster is one pack model in a wide frame, recorded in scene-media.json); the
 * bridge views are written into the revision's mirror directory and pinned by the bridge update
 * (`generate-commons.mjs --only-bridge`), which also picks up the record. Nothing is uploaded.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(SITE, 'src/data');
export const FARM_POSTER = { width: 1024, height: 1024, direction: [0.7, 0.5, 0.7], padding: 1.05 };
/**
 * Every vehicle is seen from the same place so the cards line up: from the front right (the +X, +Z side), 20
 * degrees above the horizon, in a square frame. The GLB is the delivered file; a viewer that ignores MSFT_lod
 * draws its top tier and the wheels, which is what the renderer shows.
 */
export const VEHICLE_POSTER = { width: 1024, height: 1024, direction: orbitDirection(45, 20), padding: 1.05 };

/** The Farm r34 assets with their sealed runtime GLBs, verified against the catalog. */
export async function farmTargets({ mirror, data = DATA }) {
  const farm = await readJson(join(data, 'packs/farm.json'));
  const manifest = await readJson(join(data, 'mirror-manifest.json'));
  const pins = new Map(manifest.files.map((file) => [file.path, file]));
  const archives = new Map();
  const targets = [];
  for (const asset of farm.assets) {
    const download = asset.runtimeDownload;
    if (!archives.has(download.archive)) {
      const pin = pins.get(download.archive);
      if (!pin) throw new Error(`No mirror pin for ${download.archive}`);
      const bytes = await readFile(join(mirror, download.archive));
      verifyBytes(bytes, pin, download.archive);
      archives.set(download.archive, verifyArchive(bytes));
    }
    const glb = archives.get(download.archive).files[download.member];
    if (!glb) throw new Error(`${download.archive} lacks ${download.member}`);
    verifyBytes(glb, download, asset.slug);
    targets.push({ pack: 'farm', release: farm.revision, slug: asset.slug, name: asset.name, revisionId: asset.revisionId, assetId: asset.assetId, alt: asset.description, glb, glbPath: download.member, view: FARM_POSTER });
  }
  return targets;
}

/** The vehicles' delivered GLBs from the mirror, each verified against the catalog record. */
export async function vehicleTargets({ mirror, data = DATA }) {
  const vehicles = await readJson(join(data, 'packs/vehicles.json'));
  const targets = [];
  for (const asset of vehicles.assets) {
    const download = asset.runtimeDownload;
    const glb = await readFile(join(mirror, download.path));
    verifyBytes(glb, download, asset.slug);
    targets.push({ pack: 'vehicles', release: vehicles.release, slug: asset.slug, name: asset.name, revisionId: asset.revisionId, assetId: asset.assetId, alt: asset.description, glb, glbPath: download.path, view: VEHICLE_POSTER });
  }
  return targets;
}

/**
 * The Foundry Floor models' delivered GLBs from the mirror, each verified against the catalog record, and the scene
 * page's poster: one of those GLBs in a wide frame (FOUNDRY_FLOOR_SCENE_POSTER).
 */
export async function foundryFloorTargets({ mirror, data = DATA }) {
  const pack = await readJson(join(data, 'packs/foundry-floor.json'));
  const targets = [];
  for (const asset of pack.assets) {
    const download = asset.runtimeDownload;
    const glb = await readFile(join(mirror, download.path));
    verifyBytes(glb, download, asset.slug);
    targets.push({ pack: FOUNDRY_FLOOR_ID, release: pack.release, slug: asset.slug, name: asset.name, revisionId: asset.revisionId, alt: asset.description, glb, glbPath: download.path, view: FOUNDRY_FLOOR_POSTER });
  }
  const subject = targets.find((target) => target.slug === FOUNDRY_FLOOR_SCENE_POSTER.slug);
  if (!subject) throw new Error(`The scene poster's model ${FOUNDRY_FLOOR_SCENE_POSTER.slug} is not in the pack`);
  targets.push({ ...subject, slug: FOUNDRY_FLOOR_SCENE_POSTER.key, subject: subject.slug, alt: FOUNDRY_FLOOR_SCENE_POSTER.alt, view: FOUNDRY_FLOOR_SCENE_POSTER.view });
  return targets;
}

/**
 * Record the Foundry Floor scene page's poster in scene-media.json: the rig image of one pack model, with what it
 * was rendered from, so the page can say exactly what it shows.
 */
export async function recordFoundryFloorScenePoster({ posters, data = DATA }) {
  const record = posters[rigPosterKey(FOUNDRY_FLOOR_ID, FOUNDRY_FLOOR_SCENE_POSTER.key)];
  if (!record) return null;
  const file = join(data, 'scene-media.json');
  const media = await readJson(file);
  media[FOUNDRY_FLOOR_ID] = {
    poster: rigPosterImage(record, FOUNDRY_FLOOR_SCENE_POSTER.alt),
    rig: { subject: FOUNDRY_FLOOR_SCENE_POSTER.slug, revisionId: record.revisionId, glb: record.glb, view: record.view, rendererId: record.rendererId, pngBytes: record.bytes, pngSha256: record.sha256 },
  };
  await writeJson(file, media);
  return media[FOUNDRY_FLOOR_ID];
}

/**
 * The bridge's full-tier views: the author's export of the accepted revision, verified against the accepted
 * pins, seen through the author's own capture cameras (`<cameras>/<name>.json`).
 */
export async function bridgeTargets({ outputs, cameras, tiers }) {
  const full = tiers.tiers.find((tier) => tier.tier === 'full');
  if (!full) throw new Error('The accepted tiers list has no full tier');
  const glb = await readFile(join(outputs, full.glb.file));
  verifyBytes(glb, full.glb, full.glb.file);
  const targets = [];
  for (const capture of BRIDGE_CAPTURES) {
    const file = await readFile(join(cameras, `${capture.name}.json`));
    const { camera, size } = cameraFromCaptureFile(JSON.parse(file.toString('utf8')));
    targets.push({
      pack: 'bridge',
      slug: BRIDGE_ID,
      capture: capture.name,
      key: bridgeCaptureKey(capture),
      revisionId: full.revision,
      assetId: tiers.assetId,
      alt: capture.alt,
      glb,
      glbPath: full.glb.file,
      path: bridgeCapturePath(full.revision, capture.name),
      camera,
      cameraSource: { file: `${capture.name}.json`, sha256: sha256Of(file) },
      view: { width: size, height: size },
    });
  }
  return targets;
}

/** Render one target under the rig; the receipt names everything the image depends on. */
export async function renderTarget(rig, target) {
  const bounds = inspectGlb(target.glb);
  const { width, height } = target.view;
  const camera = target.camera
    ? rig.engine.camera.validateResolvedAssetCamera(target.camera)
    : fitCamera(rig.engine, { min: bounds.boundsMin, max: bounds.boundsMax }, target.view.direction, { aspect: width / height, padding: target.view.padding });
  const { pngs, receipt } = await rig.capture({ glb: target.glb, cameras: [camera], width, height });
  const png = pngs[0];
  const meta = await sharp(png).metadata();
  if (meta.width !== width || meta.height !== height) throw new Error(`${target.slug}: PNG is ${meta.width}x${meta.height}, expected ${width}x${height}`);
  return {
    png,
    record: {
      path: target.path ?? rigPosterPath(target.pack, target.release, target.slug),
      width,
      height,
      bytes: png.length,
      sha256: sha256Of(png),
      assetId: target.assetId,
      revisionId: target.revisionId,
      ...(target.capture ? { capture: target.capture } : {}),
      glb: { member: target.glbPath, bytes: target.glb.length, sha256: sha256Of(target.glb), triangles: bounds.triangles },
      view: target.camera ? { camera, source: target.cameraSource } : { direction: target.view.direction, padding: target.view.padding, projection: camera.projection, halfHeight: camera.halfHeight },
      rendererId: receipt.rendererId,
    },
  };
}

const recordKey = (target) => target.key ?? rigPosterKey(target.pack, target.slug);

/**
 * Write the record, and (Farm) pin the PNGs and extend the image plan. `pin: false` writes the PNGs into the
 * mirror without pinning them: the bridge update pins a revision's whole directory itself and would replace
 * any earlier pin under it.
 */
export async function recordPosters({ rig, rendered, mirror, data = DATA, renderedOn = new Date().toISOString().slice(0, 10), pin = true }) {
  const manifestFile = join(data, 'mirror-manifest.json');
  const planFile = join(data, 'commons-build.json');
  const recordFile = join(data, 'rig-posters.json');
  const previous = await readJson(recordFile).catch(() => ({ schemaVersion: 1, rig: {}, posters: {} }));
  const posters = { ...previous.posters };
  // The header keeps one run per pack: the engine and service each image set came from.
  const runs = { ...(previous.rig?.runs ?? (previous.rig?.engine ? { farm: { renderedOn: previous.rig.renderedOn, engine: previous.rig.engine, service: previous.rig.service } } : {})) };
  let plan = pin ? await readJson(planFile) : undefined;
  for (const { png, record, target } of rendered) {
    if (pin) await pinMirrorFile({ mirror, manifestFile, path: record.path, bytes: png });
    else {
      await mkdir(dirname(join(mirror, record.path)), { recursive: true });
      await writeFile(join(mirror, record.path), png);
    }
    posters[recordKey(target)] = record;
    if (pin) plan = { ...plan, images: upsertBy(plan.images, 'inputPath', rigPosterImage(record, target.alt)) };
    runs[target.pack] = {
      renderedOn,
      engine: { commit: rig.engine.provenance.commit, subject: rig.engine.provenance.subject, dirty: rig.engine.provenance.dirty },
      service: rig.service,
    };
  }
  if (pin) await writeJson(planFile, plan);
  await writeJson(recordFile, { schemaVersion: 1, rig: { id: RIG_ID, backdrop: 'neutral', runs }, posters });
  return posters;
}

/**
 * Drop image plan entries no catalog file references any more, so a replaced image (an earlier poster) is not
 * built into responsive variants nobody uses. Its mirror pin stays: the earlier file is still a verified record.
 */
export async function pruneImagePlan({ data = DATA } = {}) {
  const catalogs = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.json') && !['commons-build.json', 'mirror-manifest.json', 'upload-manifest.json', 'rig-posters.json'].includes(entry.name)) catalogs.push(await readFile(path, 'utf8'));
    }
  };
  await walk(data);
  const text = catalogs.join('\n');
  const plan = await readJson(join(data, 'commons-build.json'));
  const kept = plan.images.filter((image) => text.includes(`"inputPath": ${JSON.stringify(image.inputPath)}`));
  const dropped = plan.images.filter((image) => !kept.includes(image)).map((image) => image.inputPath);
  if (dropped.length) await writeJson(join(data, 'commons-build.json'), { ...plan, images: kept });
  return dropped;
}

/** Rewrite one catalog file so its posters come from the record. */
export async function refreshCatalog({ file, pack, data = DATA }) {
  const recorded = await readJson(join(data, 'rig-posters.json'));
  const catalog = await readJson(file);
  if (Array.isArray(catalog.assets)) catalog.assets = applyRigPosters(catalog.assets, pack, recorded);
  await writeJson(file, catalog);
  return catalog;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const pack = argv[0];
  const mirror = option('--mirror', env.KILN_ASSET_MIRROR);
  if (!['farm', 'bridge', 'vehicles', FOUNDRY_FLOOR_ID].includes(pack) || !mirror) throw new Error('Usage: bun scripts/rig-posters.mjs farm|bridge|vehicles|foundry-floor --mirror DIR [--service URL] [--engine DIR] [--only a,b] [--out DIR] [--dry]  (bridge also needs --outputs DIR --cameras DIR)');
  const only = option('--only')?.split(',');
  const rig = await connectRig({ url: option('--service', env.KILN_RENDER_SERVICE_URL), engineDir: option('--engine') });
  console.log(`Rig ${RIG_ID} on ${rig.service.rendererId}; engine ${rig.engine.provenance.commit.slice(0, 7)} (${rig.engine.provenance.subject})${rig.engine.provenance.dirty ? ' with local changes' : ''}`);
  let targets;
  if (pack === 'bridge') {
    const outputs = option('--outputs');
    const cameras = option('--cameras');
    if (!outputs || !cameras) throw new Error('The bridge views need --outputs (the author export folder) and --cameras (the capture files folder)');
    targets = (await bridgeTargets({ outputs: resolve(outputs), cameras: resolve(cameras), tiers: await readJson(join(DATA, 'standalone/golden-gate-tiers.json')) })).filter((target) => !only || only.includes(target.capture));
  } else if (pack === 'vehicles') {
    targets = (await vehicleTargets({ mirror })).filter((target) => !only || only.includes(target.slug));
  } else if (pack === FOUNDRY_FLOOR_ID) {
    targets = (await foundryFloorTargets({ mirror })).filter((target) => !only || only.includes(target.slug));
  } else {
    targets = (await farmTargets({ mirror })).filter((target) => !only || only.includes(target.slug));
  }
  if (!targets.length) throw new Error('No poster targets selected');
  const rendered = [];
  for (const target of targets) {
    const { png, record } = await renderTarget(rig, target);
    rendered.push({ png, record, target });
    console.log(`${target.capture ?? target.slug}: ${record.width}x${record.height} ${record.bytes} B sha256 ${record.sha256.slice(0, 12)} from ${record.glb.triangles} triangles`);
  }
  const out = option('--out');
  if (out) {
    await mkdir(resolve(out), { recursive: true });
    for (const { png, target } of rendered) await writeFile(join(resolve(out), `${target.capture ?? target.slug}.png`), png);
  }
  if (argv.includes('--dry')) return console.log(`Dry run: ${rendered.length} images rendered; nothing recorded.`);
  const posters = await recordPosters({ rig, rendered, mirror, pin: pack !== 'bridge' });
  if (pack !== 'bridge') {
    await refreshCatalog({ file: join(DATA, `packs/${pack}.json`), pack });
    if (pack === FOUNDRY_FLOOR_ID && (await recordFoundryFloorScenePoster({ posters }))) console.log('Recorded the scene page poster in scene-media.json.');
    const dropped = await pruneImagePlan();
    if (dropped.length) console.log(`Dropped ${dropped.length} replaced images from the build plan (their mirror pins stay).`);
  } else {
    console.log('The bridge update (scripts/generate-commons.mjs --only-bridge) pins these images and applies the record.');
  }
  console.log(`Recorded ${rendered.length} ${pack} images under ${RIG_ID}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
