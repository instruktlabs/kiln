import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { imageRecord } from './generate-commons.mjs';
import { readJson, syncGroup, writeJson, writeMirrorFile } from './media-pins.mjs';
import { ASSET_BASE, hashBytes, verifyArchive, verifyBytes } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';
import { parseSums } from './scene-pack.mjs';
import { inspectVehicleGlb, loaderDraws, parseGlb, sha256Of } from './vehicle-glb.mjs';
import {
  TIER_BUDGETS,
  VEHICLES,
  VEHICLES_DIR,
  VEHICLES_ID,
  VEHICLES_NAME,
  VEHICLES_RELEASE,
  VEHICLE_CONVENTIONS,
  VEHICLE_DOCUMENTS,
  deliveredRevision,
} from './vehicles-spec.mjs';

/**
 * Stage the Generic Road Vehicles pack: verify the six delivered vehicles against everything that vouches for
 * them, put the pack's files in the asset mirror, pin them, extend the build plan and write the catalog.
 *
 *   node scripts/stage-vehicles.mjs --commons <commons> --mirror DIR [--scene-pack DIR]
 *
 * A vehicle is refused unless all of these agree: the author's delivered export, the Golden Gate scene pack's
 * copy of it and the hash its licence text states; the saved revision's sealed files and manifest (asset,
 * revision, parent, and a creation time inside the run that saved it); the binary chunk of the delivered GLB
 * and of the saved export (the `MSFT_lod` rewrite changed the JSON chunk only); and the measured geometry of
 * every tier in both forms. Sizes, triangles and bounds in the catalog are read from the GLBs. The pack's licence
 * texts are the scene pack's own, byte for byte. Nothing is uploaded.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(SITE, 'src/data');
const WINDOW_SLACK_MS = 2 * 60 * 1000;
const RUNTIME_ARCHIVE = 'generic-road-vehicles-runtime.zip';
const CONFIRMATION = 'Requested in receipt and invocation; effective reasoning effort not independently confirmed.';
const OWNER_APPROVAL = {
  recordedAt: '2026-09-29',
  statement: 'All six vehicles approved at every tier; one GLB per vehicle with the tiers inside stays.',
  source: 'Coordinator overnight log, 12:46 entry (owner answer through the question tool)',
};
/**
 * Owner approvals of a corrected revision, given after OWNER_APPROVAL, keyed by the exact revision approved: a later
 * correction of the same vehicle is not covered by them.
 */
export const CORRECTED_REVISION_APPROVALS = {
  r_6ab2ee53817449c59972502fcf008f1a: {
    recordedAt: '2026-09-30',
    statement: 'The owner approved the corrected revision on 30 September 2026.',
    source: 'Coordinator message to the site round 3 builder, 30 September 2026 (owner decision confirmed that morning)',
  },
};
const round = (value, places = 3) => Number(value.toFixed(places));
export const reviewAlt = (vehicle) => `Six saved review views of ${vehicle.name}: front, right, back, left, top and three-quarter.`;

/** Where a vehicle's files sit in the mirror. */
export const vehicleFiles = (slug) => ({
  glb: `${VEHICLES_DIR}/models/${slug}.glb`,
  licence: `${VEHICLES_DIR}/licenses/${slug}.ASSET-LICENSE.txt`,
  editable: `${VEHICLES_DIR}/editable/${slug}-editable.zip`,
  review: `media/${VEHICLES_ID}/${VEHICLES_RELEASE}/review/${slug}.png`,
});
export const RUNTIME_ARCHIVE_PATH = `${VEHICLES_DIR}/${RUNTIME_ARCHIVE}`;

/**
 * A date whose local-time fields are the UTC fields of `date`. The zip writer stores local fields, so this keeps
 * an archive's bytes the same on a machine in any time zone.
 */
export const zipTime = (date) => new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());

/** A stored (uncompressed) zip whose bytes depend only on its members, their order and `mtime`. */
export function storedZip(members, mtime) {
  const time = zipTime(mtime);
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(members).map(([path, bytes]) => [path, [bytes, { level: 0, mtime: time }]]))));
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One vehicle: every input verified, every artifact built. Throws on the first disagreement. */
export async function verifyVehicle({ vehicle, commons, scenePack, sums, runs }) {
  const author = join(commons, 'showcase/authors', vehicle.author);
  const slug = vehicle.slug;
  const revisions = [];
  for (const entry of vehicle.revisions) {
    const dir = join(author, 'assets/kiln', vehicle.assetId, 'revisions', entry.revisionId);
    const manifestBytes = await readFile(join(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.assetId !== vehicle.assetId || manifest.revisionId !== entry.revisionId || (manifest.parentRevision ?? null) !== entry.parentRevisionId) {
      throw new Error(`${slug}: the library holds ${manifest.revisionId} (asset ${manifest.assetId}, parent ${manifest.parentRevision ?? null}) where ${entry.revisionId} (parent ${entry.parentRevisionId}) is expected`);
    }
    const run = runs.find((candidate) => candidate.author === vehicle.author && candidate.stage === entry.run);
    if (!run) throw new Error(`${slug}: no recorded run ${vehicle.author}/${entry.run}`);
    if (manifest.attribution?.model !== run.requestedModel) throw new Error(`${slug}: ${entry.revisionId} is attributed to ${manifest.attribution?.model}, but run ${entry.run} asked for ${run.requestedModel}`);
    const saved = Date.parse(manifest.createdAt);
    if (saved < Date.parse(run.startedAt) - WINDOW_SLACK_MS || saved > Date.parse(run.endedAt) + WINDOW_SLACK_MS) {
      throw new Error(`${slug}: ${entry.revisionId} was saved at ${manifest.createdAt}, outside run ${entry.run} (${run.startedAt} to ${run.endedAt})`);
    }
    revisions.push({ ...entry, dir, manifest, manifestBytes, runRecord: run });
  }
  for (const [index, revision] of revisions.entries()) {
    if (index > 0 && revision.parentRevisionId !== revisions[index - 1].revisionId) throw new Error(`${slug}: ${revision.revisionId} does not follow ${revisions[index - 1].revisionId}`);
  }
  const top = revisions.at(-1);
  // Earlier revisions of the same asset: their exports are sealed by their own manifests and measured, so a
  // correction can be described by what changed between them.
  for (const revision of revisions.slice(0, -1)) {
    const sealed = revision.manifest.files?.['asset.glb'];
    if (!sealed) throw new Error(`${slug}: ${revision.revisionId} does not seal asset.glb`);
    revision.measured = inspectVehicleGlb(verifyBytes(await readFile(join(revision.dir, 'asset.glb')), sealed, `${slug} ${revision.revisionId} asset.glb`));
  }

  // The saved revision's four members, each sealed by its own manifest.
  const members = { 'manifest.json': top.manifestBytes };
  if (!Array.isArray(top.manifest.build?.dependencies) || top.manifest.build.dependencies.length !== 0) throw new Error(`${slug}: the saved revision lists dependencies (${JSON.stringify(top.manifest.build?.dependencies)}); its licence has not been reviewed for them`);
  for (const [member, record] of Object.entries(top.manifest.files)) members[member] = verifyBytes(await readFile(join(top.dir, member)), record, `${slug} ${member}`);
  for (const member of ['asset.glb', 'source.kiln.js', 'preview.png']) if (!members[member]) throw new Error(`${slug}: the saved revision does not seal ${member}`);

  // The delivered export, and what it is a rewrite of.
  const glb = await readFile(join(author, 'outputs', slug, `${slug}.glb`));
  const measured = inspectVehicleGlb(glb);
  if (measured.form !== 'MSFT_lod') throw new Error(`${slug}: the delivered export is not an MSFT_lod file (${measured.form})`);
  if (measured.root !== vehicle.root) throw new Error(`${slug}: the root node is ${measured.root}, not ${vehicle.root}`);
  if (measured.extensionsRequired.length) throw new Error(`${slug}: the delivered export requires ${measured.extensionsRequired.join(', ')}`);
  if (!parseGlb(glb).binBytes.equals(parseGlb(members['asset.glb']).binBytes)) throw new Error(`${slug}: the delivered export's binary chunk differs from the saved revision's asset.glb`);
  const savedMeasured = inspectVehicleGlb(members['asset.glb']);
  measured.tiers.forEach((tier, index) => {
    const before = savedMeasured.tiers[index];
    if (!before || tier.tier !== before.tier || tier.bodyTriangles !== before.bodyTriangles || !sameJson(tier.bodyBounds, before.bodyBounds) || !sameJson(tier.materials, before.materials) || !sameJson(tier.parts, before.parts)) {
      throw new Error(`${slug}: ${tier.tier} differs between the delivered export and the saved revision`);
    }
  });
  // The headline figures say what a loader without MSFT_lod draws; three.js's own loader agrees, or the catalog does not.
  const loaded = await loaderDraws(glb);
  const plainMeshes = measured.tiers[0].parts.length + measured.wheels.reduce((sum, wheel) => sum + wheel.parts.length, 0);
  if (loaded.triangles !== measured.drawnByPlainLoader.triangles || loaded.meshes !== plainMeshes) {
    throw new Error(`${slug}: three.js's loader draws ${loaded.meshes} meshes and ${loaded.triangles} triangles, but the measured top tier and wheels are ${plainMeshes} and ${measured.drawnByPlainLoader.triangles}`);
  }
  const wheelGeometry = ({ hiddenBeyondMetres, ...wheel }) => wheel;
  if (measured.tiers.length !== savedMeasured.tiers.length || !sameJson(measured.wheels.map(wheelGeometry), savedMeasured.wheels.map(wheelGeometry))) throw new Error(`${slug}: the wheels differ between the delivered export and the saved revision`);
  if (!measured.wheelsHiddenAtLastTier) throw new Error(`${slug}: the wheels do not drop out where ${measured.tiers.at(-1).tier} starts (they hide beyond ${measured.wheelsHiddenBeyondMetres} m, the tier starts at ${measured.tiers.at(-1).distanceMetres} m)`);
  // A correction is compared with the revision it follows: the same triangles and bounds at every tier, or not.
  const parent = revisions.length > 1 ? revisions.at(-2).measured : null;
  const geometryUnchanged = parent === null ? null : parent.tiers.length === savedMeasured.tiers.length
    && parent.tiers.every((tier, index) => tier.bodyTriangles === savedMeasured.tiers[index].bodyTriangles && sameJson(tier.bodyBounds, savedMeasured.tiers[index].bodyBounds))
    && sameJson(parent.wheels, savedMeasured.wheels);
  const budgets = TIER_BUDGETS[vehicle.budget];
  measured.tiers.forEach((tier, index) => {
    if (tier.bodyTriangles > budgets[index]) throw new Error(`${slug}: ${tier.tier} has ${tier.bodyTriangles} triangles, over its budget of ${budgets[index]}`);
  });

  // The pack's licence text: the scene pack's own, sealed by its SHA256SUMS, naming this asset, revision and GLB.
  const licenceBytes = await readFile(join(scenePack, 'licenses/vehicles', `${slug}.ASSET-LICENSE.txt`));
  const text = licenceBytes.toString('utf8');
  const field = (label) => new RegExp(`^${label}: (.+)$`, 'm').exec(text)?.[1]?.trim();
  if (!/^SPDX-License-Identifier: CC0-1\.0$/m.test(text)) throw new Error(`${slug}: the licence text does not state SPDX CC0-1.0`);
  if (field('Kiln asset') !== vehicle.assetId) throw new Error(`${slug}: the licence text names asset ${field('Kiln asset')}, not ${vehicle.assetId}`);
  if (field('Saved revision') !== top.revisionId) throw new Error(`${slug}: the licence text names revision ${field('Saved revision')}, not ${top.revisionId}`);
  const stated = /^Delivered GLB SHA-256: ([0-9a-f]{64})/m.exec(text)?.[1];
  if (stated !== sha256Of(glb)) throw new Error(`${slug}: the licence text states GLB ${stated}, the delivered export is ${sha256Of(glb)}`);
  if (sums.get(`licenses/vehicles/${slug}.ASSET-LICENSE.txt`) !== sha256Of(licenceBytes)) throw new Error(`${slug}: the licence text is not the one the scene pack's SHA256SUMS seals`);
  if (sums.get(`vehicles/${slug}.glb`) !== sha256Of(glb)) throw new Error(`${slug}: the scene pack's SHA256SUMS seals a different GLB than the delivered export`);
  const packGlb = await readFile(join(scenePack, 'vehicles', `${slug}.glb`));
  if (!packGlb.equals(glb)) throw new Error(`${slug}: the scene pack's copy differs from the delivered export`);

  // The saved revision as a sealed, deterministic archive: its four members, stored, in the revision's own time.
  const prefix = `${vehicle.assetId}/${top.revisionId}/`;
  const zip = storedZip(Object.fromEntries(Object.entries(members).map(([member, bytes]) => [`${prefix}${member}`, bytes])), new Date(top.manifest.createdAt));
  const archive = verifyArchive(zip, 'editable');
  if (archive.manifest.revisionId !== top.revisionId || archive.manifest.assetId !== vehicle.assetId) throw new Error(`${slug}: the built archive holds ${archive.manifest.revisionId}`);

  return { vehicle, revisions, top, members, glb, measured, loaded, geometryUnchanged, licence: { bytes: licenceBytes, text }, zip, preview: members['preview.png'] };
}

/** The pack archive: the six GLBs and licence texts, sealed by an inventory. Same inputs, same bytes. */
export function buildRuntimeArchive(results, { release = VEHICLES_RELEASE } = {}) {
  const members = {};
  const files = {};
  const assets = [];
  for (const { vehicle, glb, licence, top, measured } of results) {
    const model = `models/${vehicle.slug}.glb`;
    const licenceMember = `licenses/${vehicle.slug}.ASSET-LICENSE.txt`;
    members[model] = glb;
    members[licenceMember] = licence.bytes;
    files[model] = { bytes: glb.length, sha256: sha256Of(glb) };
    files[licenceMember] = { bytes: licence.bytes.length, sha256: sha256Of(licence.bytes) };
    assets.push({
      slug: vehicle.slug,
      name: vehicle.name,
      assetId: vehicle.assetId,
      revisionId: top.revisionId,
      model,
      licence: licenceMember,
      tiers: measured.tiers.map((tier) => ({ tier: tier.tier, triangles: tier.triangles, bodyTriangles: tier.bodyTriangles, wheelTriangles: tier.wheelTriangles })),
    });
  }
  const inventory = Buffer.from(`${JSON.stringify({ schemaVersion: 1, pack: VEHICLES_NAME, profile: 'runtime', release, license: 'CC0-1.0', assets, files }, null, 2)}\n`);
  const latest = new Date(Math.max(...results.map(({ top }) => Date.parse(top.manifest.createdAt))));
  const zip = storedZip({ 'delivery.json': inventory, ...members }, latest);
  verifyArchive(zip, 'delivery');
  return zip;
}

const wheelFacts = (measured) => {
  const wheel = Object.fromEntries(measured.wheels.map((entry) => [entry.name, entry]));
  for (const name of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) if (!wheel[name]) throw new Error(`The vehicle has no ${name}`);
  const dual = wheel.Wheel_RL.parts.filter((part) => part.includes('Tyre')).length > 1;
  return {
    wheelbase: round(wheel.Wheel_FL.pivot[0] - wheel.Wheel_RL.pivot[0]),
    frontTrack: round(wheel.Wheel_FR.pivot[2] - wheel.Wheel_FL.pivot[2]),
    rearTrack: round(wheel.Wheel_RR.pivot[2] - wheel.Wheel_RL.pivot[2]),
    wheelRadius: wheel.Wheel_FL.radius,
    frontWheelWidth: wheel.Wheel_FL.width,
    rearWheelWidth: wheel.Wheel_RL.width,
    dualRear: dual,
    pivots: Object.fromEntries(['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((name) => [name, wheel[name].pivot])),
  };
};

/** The catalog record of one verified vehicle. `poster` comes from the rig record (or stays null until it is rendered). */
export function vehicleAsset({ result, pins, sourceRelease = VEHICLES_RELEASE, review }) {
  const { vehicle, measured, top, revisions, members } = result;
  const top0 = measured.tiers[0];
  const drawn = measured.drawnByPlainLoader;
  const source = members['source.kiln.js'];
  const preview = pins.preview;
  // What a loader that ignores MSFT_lod draws: the top tier and the wheels. The other tiers are in `tiers`.
  const drawnParts = [...top0.parts, ...measured.wheels.flatMap((wheel) => wheel.parts)];
  const fidelity = top.manifest.preview?.fidelity;
  return {
    id: vehicle.slug,
    slug: vehicle.slug,
    name: vehicle.name,
    pack: VEHICLES_ID,
    category: vehicle.category,
    description: vehicle.description,
    assetId: vehicle.assetId,
    revisionId: top.revisionId,
    parentRevision: top.parentRevisionId,
    metrics: {
      triangles: drawn.triangles,
      meshes: drawnParts.length,
      materials: drawn.materials.length,
      bounds: drawn.bounds.size,
      boundsMin: drawn.bounds.min,
      boundsMax: drawn.bounds.max,
      clips: measured.animations,
      partPaths: drawnParts,
    },
    vehicle: wheelFacts(measured),
    tiers: measured.tiers.map((tier, index) => ({
      tier: tier.tier,
      bodyTriangles: tier.bodyTriangles,
      wheelTriangles: tier.wheelTriangles,
      triangles: tier.triangles,
      budget: TIER_BUDGETS[vehicle.budget][index],
      wheelsShown: tier.wheelsShown,
      bounds: tier.bounds.size,
      coverageBelow: tier.coverageBelow,
      distanceMetres: tier.distanceMetres,
      parts: tier.parts.length,
      materials: tier.materials,
    })),
    tierLinks: { form: measured.form, culledBelow: measured.culledBelow, culledDistanceMetres: measured.culledDistanceMetres, wheelsHiddenAtLastTier: measured.wheelsHiddenAtLastTier, wheelsHiddenBeyondMetres: measured.wheelsHiddenBeyondMetres },
    poster: null,
    reviewImage: {
      ...imageRecord(preview.path, preview.width, preview.height, reviewAlt(vehicle)),
      sourceRevisionId: top.revisionId,
      exactRevision: true,
      ...(fidelity ? { fidelity: { materialFaithful: fidelity.materialFaithful, exactArtifact: fidelity.exactArtifact, delivered: fidelity.delivered, rendererId: fidelity.rendererId, backdrop: top.manifest.preview?.backdrop ?? null } } : {}),
    },
    sourcePath: `/sources/${VEHICLES_ID}/${vehicle.slug}.kiln.js`,
    sourceSha256: sha256Of(source),
    modelPath: `/models/${VEHICLES_ID}/${vehicle.slug}.glb`,
    runtimeDownload: { ...pins.glb, url: `${ASSET_BASE}${pins.glb.path}`, archive: RUNTIME_ARCHIVE_PATH, member: `models/${vehicle.slug}.glb`, form: 'MSFT_lod' },
    editableDownload: { ...pins.editable, url: `${ASSET_BASE}${pins.editable.path}`, members: Object.keys(members), glbForm: 'named-groups' },
    licence: { ...pins.licence, url: `${ASSET_BASE}${pins.licence.path}`, spdx: 'CC0-1.0', statesDeliveredGlbSha256: sha256Of(result.glb) },
    provenance: {
      originalModel: 'Claude Sonnet 5.5',
      refinementModels: revisions.length > 1 ? ['Claude Sonnet 5.5'] : [],
      history: revisions.map((revision) => revisionRecord(revision)),
    },
    revisions: revisions.map((revision) => revisionRecord(revision)),
    review,
    license: 'CC0-1.0',
    sceneDeepLink: null,
  };
}

function revisionRecord(revision) {
  const run = revision.runRecord;
  return {
    stage: revision.stage === 'first' ? 'First saved revision' : 'Review 2 · saved revision',
    request: revision.run,
    revisionId: revision.revisionId,
    parentRevisionId: revision.parentRevisionId,
    savedAt: revision.manifest.createdAt,
    brief: revision.manifest.brief ?? null,
    model: 'Claude Sonnet 5.5',
    modelId: run.requestedModel,
    requestedEffort: run.requestedEffort,
    confirmedEffort: run.confirmedEffort,
    harness: run.harness,
    harnessVersion: run.harnessVersion,
    confirmation: run.confirmation ?? CONFIRMATION,
    run: { stage: run.stage, label: run.label, status: run.status, stop: run.stop, startedAt: run.startedAt, endedAt: run.endedAt, receiptSha256: run.source.receiptSha256, invocationSha256: run.source.invocationSha256 },
  };
}

/**
 * What the owner has and has not approved, per vehicle. The bus was corrected after the first approval was recorded;
 * a corrected revision counts as approved only when CORRECTED_REVISION_APPROVALS names that exact revision.
 */
export function vehicleReview(vehicle, { geometryUnchanged = null, approvals = CORRECTED_REVISION_APPROVALS } = {}) {
  const corrected = vehicle.revisions.length > 1;
  if (!corrected) {
    return {
      status: 'accepted',
      ownerAccepted: true,
      scope: 'The owner approved all six vehicles at every tier on 29 September 2026. This is the revision that was approved.',
      recordedAt: OWNER_APPROVAL.recordedAt,
      source: OWNER_APPROVAL.source,
    };
  }
  const approval = approvals[vehicle.revisions.at(-1).revisionId] ?? null;
  const correction = `${vehicle.correction}${geometryUnchanged ? ' Its triangle counts, body bounds and wheels equal the first revision’s at every tier.' : ''} ${approval ? approval.statement : 'Approval of the corrected revision is not recorded.'}`;
  return {
    status: approval ? 'accepted' : 'awaiting-owner-review',
    ownerAccepted: Boolean(approval),
    scope: `The owner approved all six vehicles at every tier on 29 September 2026. ${correction}`,
    correction,
    recordedAt: approval?.recordedAt ?? OWNER_APPROVAL.recordedAt,
    source: approval?.source ?? OWNER_APPROVAL.source,
  };
}

async function documentPins(commons, documents) {
  const pins = [];
  for (const document of documents) {
    const bytes = await readFile(join(commons, document.path));
    pins.push({ role: document.role, path: document.path, bytes: bytes.length, sha256: sha256Of(bytes) });
  }
  return pins;
}

const packDescription = 'Six generic road vehicles made with Kiln: hatchback, sedan, SUV, pickup truck, box truck and transit bus. Each has three detail tiers, separate wheels, a near-white paint a scene can tint, its source and its revision history.';

/** The pack record from the verified results (assets without their posters; `posters` applies the rig record). */
export function vehiclesCatalog({ results, pins, documents, downloads, posters }) {
  const assets = results.map((result) => vehicleAsset({ result, pins: pins.get(result.vehicle.slug), review: vehicleReview(result.vehicle, result) }));
  const approved = assets.filter((asset) => asset.review.ownerAccepted).length;
  const withPosters = applyRigPosters(assets, VEHICLES_ID, posters);
  const withheld = assets.filter((asset) => !asset.review.ownerAccepted).map((asset) => asset.name);
  return {
    schemaVersion: 1,
    id: VEHICLES_ID,
    name: VEHICLES_NAME,
    description: packDescription,
    release: VEHICLES_RELEASE,
    assetCount: assets.length,
    license: 'CC0-1.0',
    licenseScope: 'CC0-1.0 covers authored asset content only, to the extent of the owner’s rights. Kiln and any software that opens these files retain their own licenses.',
    licenceNote: 'The saved revision of each vehicle lists no dependencies, so no imported model or texture is in it; the site checked that. The licence texts were written by the Golden Gate scene’s pack staging, because the vehicle authors’ folders ship none, and are published here unchanged.',
    conventions: VEHICLE_CONVENTIONS,
    budgets: TIER_BUDGETS,
    downloads,
    documents,
    ownerReview: {
      acceptedAssets: approved,
      total: assets.length,
      status: approved === assets.length ? 'all-current-revisions-accepted' : 'awaiting-review-of-corrected-revision',
      date: OWNER_APPROVAL.recordedAt,
      statement: OWNER_APPROVAL.statement,
      source: OWNER_APPROVAL.source,
      awaiting: withheld,
    },
    scene: { id: 'golden-gate', name: 'Golden Gate scene', href: '/scenes/golden-gate/' },
    assets: withPosters,
  };
}

export async function stageVehicles({ commons, scenePack, mirror, data = DATA, log = console.log, vehicles = VEHICLES, documents = VEHICLE_DOCUMENTS, mirrorBase = ASSET_BASE }) {
  const runs = await readJson(join(data, 'vehicle-runs.json'));
  const packs = await readJson(join(data, 'scene-packs.json'));
  const sumsBytes = await readFile(join(scenePack, 'SHA256SUMS'));
  const recordedSums = packs['golden-gate']?.sha256sumsSha256;
  if (recordedSums !== hashBytes(sumsBytes)) throw new Error(`The scene pack's SHA256SUMS (${hashBytes(sumsBytes).slice(0, 12)}) is not the one the site recorded for golden-gate (${String(recordedSums).slice(0, 12)}); stage that pack first`);
  const sums = parseSums(sumsBytes.toString('utf8'));

  const results = [];
  for (const vehicle of vehicles) {
    const result = await verifyVehicle({ vehicle, commons, scenePack, sums, runs });
    results.push(result);
    const [top, second, third] = result.measured.tiers;
    log(`${vehicle.slug.padEnd(11)} ${result.top.revisionId.slice(0, 12)} GLB ${result.glb.length} B sha256 ${sha256Of(result.glb).slice(0, 12)} = licence = scene pack; binary chunk = saved asset.glb; tiers ${top.bodyTriangles}/${second.bodyTriangles}/${third.bodyTriangles} + wheels ${top.wheelTriangles}; three.js loader draws ${result.loaded.meshes} meshes, ${result.loaded.triangles} triangles; saved ${result.top.manifest.createdAt.slice(0, 16)} inside ${result.top.runRecord.author}/${result.top.run}`);
  }

  // Files into the mirror; a record of every pin.
  const pinList = [];
  const pinsBySlug = new Map();
  const pin = async (path, bytes) => {
    const record = await writeMirrorFile(mirror, path, bytes);
    pinList.push(record);
    return record;
  };
  for (const result of results) {
    const files = vehicleFiles(result.vehicle.slug);
    const meta = await sharp(result.preview).metadata();
    if (meta.format !== 'png') throw new Error(`${result.vehicle.slug}: the saved preview is not a PNG`);
    pinsBySlug.set(result.vehicle.slug, {
      glb: await pin(files.glb, result.glb),
      licence: await pin(files.licence, result.licence.bytes),
      editable: await pin(files.editable, result.zip),
      preview: { ...(await pin(files.review, result.preview)), width: meta.width, height: meta.height },
    });
  }
  const runtime = buildRuntimeArchive(results);
  const runtimePin = await pin(RUNTIME_ARCHIVE_PATH, runtime);
  const runtimeFiles = verifyArchive(runtime, 'delivery');
  const downloads = [{
    profile: 'runtime',
    archive: RUNTIME_ARCHIVE,
    bytes: runtimePin.bytes,
    sha256: runtimePin.sha256,
    files: Object.keys(runtimeFiles.files).length,
    assets: results.length,
    path: runtimePin.path,
    url: `${mirrorBase}${runtimePin.path}`,
    contents: ['Six runtime GLBs with their three detail tiers linked by MSFT_lod', 'One licence text per vehicle', 'A delivery.json inventory with member hashes'],
    compatibility: 'Standard glTF 2.0. A loader that does not know the MSFT_lod extension draws LOD0 and the wheels; the viewer on this site (Three.js 0.186) does exactly that. Other engines are not qualified by this download.',
  }];

  // The manifest and the build plan hold exactly this pack's entries under its own prefixes; a repeated run
  // leaves both files unchanged.
  const manifestFile = join(data, 'mirror-manifest.json');
  const manifest = await readJson(manifestFile);
  const ownFiles = pinList.filter((record) => record.path.startsWith(`packs/${VEHICLES_ID}/`));
  const ownMedia = pinList.filter((record) => record.path.startsWith(`media/${VEHICLES_ID}/`));
  await writeJson(manifestFile, { ...manifest, files: syncGroup(syncGroup(manifest.files, 'path', `packs/${VEHICLES_ID}/`, ownFiles), 'path', `media/${VEHICLES_ID}/`, ownMedia) });

  const planFile = join(data, 'commons-build.json');
  const plan = await readJson(planFile);
  const editable = results.map((result) => ({ result, path: vehicleFiles(result.vehicle.slug).editable }));
  const nextPlan = {
    ...plan,
    images: syncGroup(plan.images, 'inputPath', `media/${VEHICLES_ID}/`, results.map((result) => {
      const preview = pinsBySlug.get(result.vehicle.slug).preview;
      return { ...imageRecord(preview.path, preview.width, preview.height, reviewAlt(result.vehicle)), sourceRevisionId: result.top.revisionId, exactRevision: true };
    })),
    archives: syncGroup(plan.archives.map((path) => ({ path })), 'path', `packs/${VEHICLES_ID}/`, [RUNTIME_ARCHIVE_PATH, ...editable.map(({ path }) => path)].map((path) => ({ path }))).map((entry) => entry.path),
    models: syncGroup(plan.models, 'output', `models/${VEHICLES_ID}/`, results.map((result) => ({ path: pinsBySlug.get(result.vehicle.slug).glb.path, output: `models/${VEHICLES_ID}/${result.vehicle.slug}.glb`, bytes: result.glb.length, sha256: sha256Of(result.glb) }))),
    sources: syncGroup(plan.sources, 'output', `sources/${VEHICLES_ID}/`, editable.map(({ result, path }) => {
      const source = result.members['source.kiln.js'];
      return { archive: path, member: `${result.vehicle.assetId}/${result.top.revisionId}/source.kiln.js`, output: `sources/${VEHICLES_ID}/${result.vehicle.slug}.kiln.js`, bytes: source.length, sha256: sha256Of(source) };
    })),
  };
  await writeJson(planFile, nextPlan);

  const posters = await readJson(join(data, 'rig-posters.json')).catch(() => ({ posters: {} }));
  const catalog = vehiclesCatalog({ results, pins: pinsBySlug, documents: await documentPins(commons, documents), downloads, posters });
  await writeJson(join(data, 'packs/vehicles.json'), catalog);
  log(`Staged ${pinList.length} files under ${VEHICLES_DIR}/ and media/${VEHICLES_ID}/ (${pinList.reduce((sum, file) => sum + file.bytes, 0)} B); wrote packs/vehicles.json with ${catalog.assets.length} assets.`);
  return { results, catalog, pins: pinList };
}

async function main(argv = process.argv.slice(2)) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const commons = option('--commons', process.env.KILN_COMMONS_DIR);
  const mirror = option('--mirror', process.env.KILN_ASSET_MIRROR);
  // By default, the Golden Gate pack the site records and stages (scripts/scene-pack.mjs), whatever its release.
  const recorded = (await readJson(join(DATA, 'scene-packs.json')))['golden-gate'];
  const scenePack = option('--scene-pack', join(SITE, 'public', String(recorded?.base ?? '').replace(/^\/+/, '')));
  if (!commons || !mirror) throw new Error('Usage: node scripts/stage-vehicles.mjs --commons DIR --mirror DIR [--scene-pack DIR]  (run scripts/vehicle-runs.mjs and scripts/scene-pack.mjs first)');
  await mkdir(resolve(mirror), { recursive: true });
  await stageVehicles({ commons: resolve(commons), scenePack: resolve(scenePack), mirror: resolve(mirror) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
