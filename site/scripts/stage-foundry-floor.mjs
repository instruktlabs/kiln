import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { foundryInventory } from './foundry-inventory.mjs';
import { inspectFoundryFloorGlb } from './foundry-floor-glb.mjs';
import { FOUNDRY_FLOOR_GROUPS, FOUNDRY_FLOOR_ID, FOUNDRY_FLOOR_NAME, displayName, foundryFloorDir, foundryFloorFiles } from './foundry-floor-spec.mjs';
import { readJson, syncGroup, writeJson, writeMirrorFile } from './media-pins.mjs';
import { ASSET_BASE, hashBytes, verifyArchive } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';
import { parseSums } from './scene-pack.mjs';
import { storedZip } from './stage-vehicles.mjs';
import { loaderDraws, sha256Of } from './vehicle-glb.mjs';

/**
 * Stage the Foundry Floor pack for download: verify each of the pack's models against everything that vouches for it,
 * put the files in the asset mirror, pin them, extend the build plan and write the catalog.
 *
 *   node scripts/stage-foundry-floor.mjs --mirror DIR [--scene-pack public/scene-packs/foundry-floor/<release>]
 *
 * The source is the Foundry Floor scene pack the site already stages (run `node scripts/scene-pack.mjs` first); its
 * `SHA256SUMS` must be the one the site recorded. A model is refused unless all of these agree: the GLB's bytes, the
 * pack's `SHA256SUMS`, the asset map's pins (`data/assets.json`), the pack's source pins (`pack.json`), and the
 * licence text's line for it (model, revision, author folder and SHA-256); its credit and every other licence
 * statement in the pack say CC0-1.0; and its triangles, bounds, materials, root and clips as read here equal the
 * asset map's measured values, with three.js's own loader drawing every triangle counted. Any licence statement that is
 * not CC0-1.0 stops the run. The author workspaces are not read: the pack's records are the evidence. Nothing is
 * uploaded.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(SITE, 'src/data');
/** Stored archives take their timestamps from here; the DOS epoch keeps the bytes free of any clock. */
const ARCHIVE_TIME = new Date(Date.UTC(1980, 0, 1));
const TOLERANCE = 1.01e-4;
const SCOPE = 'CC0-1.0 covers authored asset content only, to the extent of the owner’s rights. Kiln and any software that opens these files retain their own licenses.';
const PROVENANCE_FILES = new Set(['data/assets.json', 'data/campus-assets.json', 'evidence/asset-replacements.json']);

const sameBox = (a, b) => (a === null || b === null ? a === b : ['min', 'max', 'size'].every((key) => a[key].every((value, axis) => Math.abs(value - b[key][axis]) <= TOLERANCE)));
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Describe the actual default scene independently of optional lower tiers. */
export function lodSummary(results) {
  const standard=results.filter(result=>result.measured.lodMode==='MSFT_lod').length;
  const legacy=results.filter(result=>result.measured.hasLod1 && result.measured.lodMode!=='MSFT_lod').length;
  return [standard ? `${standard} models declare optional MSFT_lod tiers. A loader that ignores this extension draws the default detailed form; an LOD-aware application can select the separate lower tiers.` : null,
    legacy ? `${legacy} models retain a visible named lod1 group without standard LOD separation. A plain glTF viewer draws that group together with the detailed parts; the Foundry Floor scene controls it explicitly.` : null,
    !standard&&!legacy ? 'These models have no separate lower-detail forms.' : null].filter(Boolean).join(' ');
}

/** The model lines of the pack's licence text: path, slug, revision, author folder and SHA-256. */
export function parseLicence(text) {
  if (!/^SPDX-License-Identifier: CC0-1\.0$/m.test(text)) throw new Error('The licence text does not state SPDX-License-Identifier: CC0-1.0; stopping rather than relabelling the pack');
  if (!/to the extent of the owner's rights/.test(text.replace(/\s+/g, ' '))) throw new Error('The licence text does not limit the designation to the extent of the owner\'s rights');
  const lines = new Map();
  const rows = text.split(/\r?\n/);
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index];
    const current = /^(models\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.glb) {2}Kiln asset ([a-zA-Z0-9_-]+), revision (r_[0-9a-f]{32}) {2}SHA-256 ([0-9a-f]{64})$/.exec(line);
    if (current) {
      const attribution = /^ {4}(.+)\. Requested effort: ([^.]+)\. Independently confirmed: not recorded\.$/.exec(rows[++index] ?? '');
      if (!attribution) throw new Error(`The licence text lacks the author and requested effort for ${current[1]}`);
      if (lines.has(current[1])) throw new Error(`The licence text lists ${current[1]} twice`);
      lines.set(current[1], { asset: current[2], revision: current[3], sha256: current[4], author: attribution[1], requestedEffort: attribution[2] === 'not recorded' ? null : attribution[2], confirmedEffort: null });
      continue;
    }
    const match = /^(models\/[a-z0-9-]+\.glb) {2}([a-z0-9-]+) {2}Kiln revision (r_[0-9a-f]{32}) {2}showcase\/authors\/([a-z0-9-]+) {2}SHA-256 ([0-9a-f]{64})$/.exec(line);
    if (!match) {
      if (/^models\//.test(line)) throw new Error(`Malformed model licence entry: ${line}`);
      continue;
    }
    if (lines.has(match[1])) throw new Error(`The licence text lists ${match[1]} twice`);
    lines.set(match[1], { slug: match[2], revision: match[3], author: match[4], sha256: match[5] });
  }
  const release = /^Release: (\S+)$/m.exec(text)?.[1] ?? null;
  return { lines, release };
}

/** Cross-check identity independently of GLB measurement; FF2 remains verifiable as historical input. */
export function verifyModelIdentity({ path, slug, source, line, credit, sha }) {
  const modern = Boolean(line?.asset);
  const identityMatches = line && (modern ? line.asset === source.asset : line.slug === slug) && line.revision === source.revision && line.author === source.author && line.sha256 === sha;
  if (!identityMatches || (modern && (line.requestedEffort !== source.requestedEffort || source.confirmedEffort !== null))) throw new Error(`${path}: licence identity differs from its asset, revision, author, effort or SHA-256`);
  const expected = modern ? `Kiln asset ${line.asset}, revision ${line.revision}. ${line.author}. Requested effort: ${line.requestedEffort ?? 'not recorded'}. Independently confirmed: not recorded.` : null;
  if (!credit || credit.licence !== 'CC0-1.0' || (modern ? credit.source !== expected : !credit.source.includes(source.revision) || !credit.source.endsWith(`showcase/authors/${source.author}`))) throw new Error(`${path}: pack credit does not match the licence identity`);
}

/** Every licence statement the pack makes, each checked to be CC0-1.0; anything else stops the run. */
export function licenceStatements({ pack, assetMap, licence }) {
  const statements = [
    { where: 'licenses/ASSET-LICENSE.txt', spdx: /^SPDX-License-Identifier: (\S+)$/m.exec(licence)?.[1] ?? null },
    { where: 'data/assets.json licence', spdx: assetMap.licence?.spdx ?? null },
    ...pack.credits.map((credit) => ({ where: `pack.json credit ${credit.name}`, spdx: credit.licence ?? null })),
  ];
  const other = statements.filter((statement) => statement.spdx !== 'CC0-1.0');
  if (other.length) throw new Error(`Stop and report: ${other.map((statement) => `${statement.where} says ${statement.spdx}`).join('; ')}. The pack is not relabelled.`);
  return statements;
}

/** One model: every record that vouches for it checked, then measured from the file. */
export async function verifyModel({ key, entity, scenePack, sums, pack, licenceLines, assetMap }) {
  const path = entity.glb;
  if(!/^models\/[a-z0-9-]+\.glb$/.test(path))throw new Error(`${key}: unsafe interior model path`);
  const slug = path.split('/').at(-1).slice(0,-4);
  if (!['accepted', 'review-candidate'].includes(entity.status)) throw new Error(`${key}: the asset map marks it ${entity.status}, not an accepted asset or explicit review candidate`);
  const glb = await readFile(join(scenePack, path));
  const sha = sha256Of(glb);
  if (sums.get(path) !== sha) throw new Error(`${slug}: the scene pack's SHA256SUMS seals ${sums.get(path)}, the file is ${sha}`);
  if (entity.pins?.bytes !== glb.length || entity.pins?.sha256 !== sha) throw new Error(`${slug}: the asset map pins ${entity.pins?.bytes} B ${entity.pins?.sha256}, the file is ${glb.length} B ${sha}`);
  const source = pack.source.models[key];
  if (!source || source.revision !== entity.source.revision || source.bytes !== glb.length || source.sha256 !== sha) throw new Error(`${slug}: pack.json's source pin ${JSON.stringify(source)} differs from the asset map and the file`);
  const line = licenceLines.get(path);
  if(line?.asset && source.asset!==entity.asset)throw new Error(`${slug}: asset identity differs from the asset map`);
  if (line?.asset) for (const field of ['asset', 'author', 'requestedEffort', 'confirmedEffort']) if (source[field] !== entity.source[field]) throw new Error(`${slug}: source ${field} differs from asset map`);
  const credit = pack.credits.find((entry) => entry.name === `${entity.asset} (Kiln-authored model)`);
  verifyModelIdentity({ path, slug, source: entity.source, line, credit, sha });
  const placed = pack.models.filter((model) => model.id === key && model.path === path).length;
  const unplaced = (pack.source.unplaced ?? []).filter((entry) => entry.id === key && entry.file === path);
  if (placed + unplaced.length !== 1) throw new Error(`${slug}: pack.json lists it ${placed} times as a placed model and ${unplaced.length} times as unplaced`);

  const measured = inspectFoundryFloorGlb(glb, { hideByDefault: entity.hideByDefault ?? [] });
  const stated = entity.measured;
  const differences = [];
  for (const group of ['detailed', 'lod1', 'hiddenByDefault']) if (measured.triangles[group] !== stated.triangles[group]) differences.push(`${group} triangles ${measured.triangles[group]} (map ${stated.triangles[group]})`);
  if (!sameBox(measured.bounds, stated.bounds)) differences.push(`bounds ${JSON.stringify(measured.bounds)} (map ${JSON.stringify(stated.bounds)})`);
  if (!sameBox(measured.lod1Bounds, stated.lod1Bounds ?? null)) differences.push('lod1 bounds');
  if (!sameList(measured.materials, stated.materials)) differences.push(`materials ${measured.materials.join(', ')}`);
  if (measured.root !== stated.root) differences.push(`root ${measured.root} (map ${stated.root})`);
  if (!sameList(measured.clips, (entity.clips ?? []).map((clip) => clip.name))) differences.push(`clips ${measured.clips.join(', ')}`);
  if (measured.unreachableMeshNodes.length) differences.push(`meshes outside the scene tree: ${measured.unreachableMeshNodes.join(', ')}`);
  if (measured.extensionsRequired.length) differences.push(`requires ${measured.extensionsRequired.join(', ')}`);
  if (!sameList(measured.extensionsUsed, stated.extensions ?? [])) differences.push(`extensions ${measured.extensionsUsed.join(', ')} (map ${(stated.extensions ?? []).join(', ')})`);
  if (measured.copyright !== null) differences.push(`the file states a copyright (${measured.copyright})`);
  if (measured.textures !== stated.textures) differences.push(`textures ${measured.textures} (map ${stated.textures})`);
  // The far form lies inside the detailed parts' bounding box, which is what the page says about it.
  if (!sameBox(measured.allBounds, measured.bounds)) differences.push(`lod1 reaches outside the detailed bounds (${JSON.stringify(measured.allBounds.size)})`);
  if (differences.length) throw new Error(`${slug}: the GLB and the asset map disagree: ${differences.join('; ')}`);
  // Verify the actual default scene. Legacy visible groups draw together; optional MSFT_lod nodes do not.
  const loaded = await loaderDraws(glb);
  if (loaded.triangles !== measured.defaultTriangles) throw new Error(`${slug}: three.js's loader draws ${loaded.triangles} triangles, the reader counts ${measured.defaultTriangles} in the default scene`);
  const lodClass = entity.lod ? assetMap.lod.classes[entity.lod] : null;
  return { key, path, entity, slug, glb, sha, measured, loaded, placed: placed === 1, unplacedWhy: unplaced[0]?.why ?? null, lodClass, credit };
}

/** Campus files use sealed source pins and direct GLB measurements, without pretending to have interior measurements. */
export async function verifyCampusModel({ item, scenePack, sums, pack, licenceLines }) {
  const { key, source, path, slug, group, placed, unplacedWhy } = item;
  const glb = await readFile(join(scenePack, path));
  const sha = sha256Of(glb);
  if (sums.get(path) !== sha || source.sha256 !== sha || source.bytes !== glb.length) throw new Error(`${key}: campus bytes differ from the sealed source pin`);
  const line = licenceLines.get(path);
  const matching = pack.credits.filter(credit => credit.source === `Kiln asset ${source.asset}, revision ${source.revision}. ${source.author}. Requested effort: ${source.requestedEffort ?? 'not recorded'}. Independently confirmed: not recorded.`);
  if (matching.length !== 1) throw new Error(`${key}: expected one exact model credit`);
  verifyModelIdentity({ path, slug, source, line, credit: matching[0], sha });
  const measured = inspectFoundryFloorGlb(glb);
  if (!measured.allBounds || measured.unreachableMeshNodes.length || measured.extensionsRequired.length || measured.copyright !== null) throw new Error(`${key}: unsupported or conflicting GLB content`);
  const loaded = await loaderDraws(glb);
  if (loaded.triangles !== measured.defaultTriangles) throw new Error(`${key}: loader and default-scene measured triangle counts differ`);
  return { key, path, entity: { source, class: group }, slug, glb, sha, measured, loaded, placed, unplacedWhy, lodClass: null, credit: matching[0] };
}

/** The pack archive: every model GLB and the licence text, sealed by an inventory. Same inputs, same bytes. */
export function buildModelsArchive({ results, licenceBytes, release, additionalFiles = {} }) {
  const members = {};
  const files = {};
  const assets = [];
  for (const { slug, path, glb, sha, entity, measured, placed } of results) {
    const model = path ?? `models/${slug}.glb`;
    members[model] = glb;
    files[model] = { bytes: glb.length, sha256: sha };
    assets.push({ slug, name: displayName(slug), revisionId: entity.source.revision, model, placedInScene: placed, triangles: { detailed: measured.triangles.detailed, lod1: measured.triangles.lod1, hiddenByDefault: measured.triangles.hiddenByDefault } });
  }
  for (const [path, bytes] of Object.entries(additionalFiles)) {
    if (members[path] || !(/^licenses\/[a-zA-Z0-9_./-]+$/.test(path) || PROVENANCE_FILES.has(path)) || path.includes('..')) throw new Error(`Invalid additional archive file: ${path}`);
    members[path] = bytes; files[path] = { bytes: bytes.length, sha256: sha256Of(bytes) };
  }
  members['licenses/ASSET-LICENSE.txt'] = licenceBytes;
  files['licenses/ASSET-LICENSE.txt'] = { bytes: licenceBytes.length, sha256: sha256Of(licenceBytes) };
  const inventory = Buffer.from(`${JSON.stringify({ schemaVersion: 1, pack: FOUNDRY_FLOOR_NAME, profile: 'models', release, status: 'in production', license: 'CC0-1.0', assets, files }, null, 2)}\n`);
  const zip = storedZip({ 'delivery.json': inventory, ...members }, ARCHIVE_TIME);
  verifyArchive(zip, 'delivery');
  return zip;
}

const round = (value) => Number(value.toFixed(4));

/** The catalog record of one verified model; `poster` comes from the rig record (null until it is rendered). */
export function foundryFloorAsset({ result, pins, release, licencePin }) {
  const { key, entity, slug, measured, placed, unplacedWhy, lodClass } = result;
  const name = displayName(slug);
  const group = FOUNDRY_FLOOR_GROUPS.find((candidate) => candidate.classes.includes(entity.class));
  if (!group) throw new Error(`${slug}: no page group lists class ${entity.class}`);
  return {
    id: key,
    slug,
    name,
    pack: FOUNDRY_FLOOR_ID,
    group: group.id,
    class: entity.class,
    description: `The ${/^[A-Z]{2}/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1)} model from the ${FOUNDRY_FLOOR_NAME} pack, seen from the front right.`,
    revisionId: entity.source.revision,
    reviewStatus: entity.status ?? 'review-candidate',
    author: entity.source.author,
    ...(entity.source.asset ? { attribution: { author: entity.source.author, asset: entity.source.asset, requestedEffort: entity.source.requestedEffort, confirmedEffort: entity.source.confirmedEffort, ...(entity.source.attributionNote ? { note: entity.source.attributionNote } : {}) } } : {}),
    placedInScene: placed,
    ...(unplacedWhy ? { unplacedWhy } : {}),
    metrics: {
      // Actual Three.js default drawing, separately from the complete file's optional lower tiers.
      triangles: measured.defaultTriangles,
      trianglesAllTiers: measured.triangles.total,
      trianglesDetailed: measured.triangles.detailed,
      trianglesLod1: measured.triangles.lod1,
      trianglesHidden: measured.triangles.hiddenByDefault,
      bounds: measured.allBounds.size.map(round),
      boundsMin: measured.allBounds.min,
      boundsMax: measured.allBounds.max,
      materials: measured.materials.length,
      clips: measured.clips,
      nodes: measured.nodeCount,
      meshes: measured.meshCount,
    },
    lod: measured.hasLod1 ? { form: measured.lodMode, class: entity.lod, nearMetres: lodClass?.nearM ?? null, farMetres: lodClass?.farM ?? null } : null,
    hideByDefault: entity.hideByDefault ?? [],
    runtimeDownload: { ...pins.glb, url: `${ASSET_BASE}${pins.glb.path}`, archive: foundryFloorFiles(release).archive, member: result.path ?? `models/${slug}.glb` },
    licence: { ...licencePin, url: `${ASSET_BASE}${licencePin.path}`, spdx: 'CC0-1.0', statesGlbSha256: result.sha },
    license: 'CC0-1.0',
    poster: null,
  };
}

export async function stageFoundryFloor({ scenePack, mirror, data = DATA, log = console.log, mirrorBase = ASSET_BASE }) {
  const record = (await readJson(join(data, 'scene-packs.json')))[FOUNDRY_FLOOR_ID];
  if (!record) throw new Error('The site has no Foundry Floor scene pack record; run node scripts/scene-pack.mjs first');
  const sumsBytes = await readFile(join(scenePack, 'SHA256SUMS'));
  if (hashBytes(sumsBytes) !== record.sha256sumsSha256) throw new Error(`The scene pack's SHA256SUMS (${hashBytes(sumsBytes).slice(0, 12)}) is not the one the site recorded (${String(record.sha256sumsSha256).slice(0, 12)}); stage that pack first`);
  const packBytes = await readFile(join(scenePack, 'pack.json'));
  if (hashBytes(packBytes) !== record.packJsonSha256) throw new Error('The scene pack\'s pack.json is not the one the site recorded');
  const sums = parseSums(sumsBytes.toString('utf8'));
  const pack = JSON.parse(packBytes.toString('utf8'));
  if (pack.id !== FOUNDRY_FLOOR_ID || pack.release !== record.release) throw new Error(`pack.json is ${pack.id} ${pack.release}, the record ${FOUNDRY_FLOOR_ID} ${record.release}`);
  const release = record.release;
  const assetMapBytes = await readFile(join(scenePack, 'data/assets.json'));
  if (sums.get('data/assets.json') !== hashBytes(assetMapBytes) || pack.source.assetMap !== hashBytes(assetMapBytes)) throw new Error('data/assets.json is not the asset map the pack seals');
  const assetMap = JSON.parse(assetMapBytes.toString('utf8'));
  const licenceBytes = await readFile(join(scenePack, 'licenses/ASSET-LICENSE.txt'));
  if (sums.get('licenses/ASSET-LICENSE.txt') !== hashBytes(licenceBytes)) throw new Error('licenses/ASSET-LICENSE.txt is not the text the pack seals');
  const licenceText = licenceBytes.toString('utf8');
  const statements = licenceStatements({ pack, assetMap, licence: licenceText });
  const { lines: licenceLines, release: licenceRelease } = parseLicence(licenceText);
  if (licenceRelease !== release) throw new Error(`The licence text is for release ${licenceRelease}, the pack is ${release}`);
  let campusMap;
  if (sums.has('data/campus-assets.json')) {
    const bytes = await readFile(join(scenePack, 'data/campus-assets.json'));
    if (hashBytes(bytes) !== sums.get('data/campus-assets.json')) throw new Error('Campus asset map differs from its seal');
    campusMap = JSON.parse(bytes.toString('utf8'));
  }
  const inventory = foundryInventory({ pack, assetMap, campusMap, sums, licenceLines });
  if (pack.credits.length !== inventory.length) throw new Error('The model credit inventory is incomplete');
  log(`${FOUNDRY_FLOOR_NAME} ${release}: SHA256SUMS ${record.sha256sumsSha256.slice(0, 12)} and pack.json ${record.packJsonSha256.slice(0, 12)} are the recorded ones; data/assets.json ${hashBytes(assetMapBytes).slice(0, 12)} and the licence text ${hashBytes(licenceBytes).slice(0, 12)} are sealed; ${statements.length} licence statements, all CC0-1.0.`);

  const results = [];
  for (const item of inventory) {
    const { key } = item;
    const result = item.entity ? await verifyModel({ key, entity: item.entity, scenePack, sums, pack, licenceLines, assetMap }) : await verifyCampusModel({ item, scenePack, sums, pack, licenceLines });
    const { entity } = result;
    results.push(result);
    const t = result.measured.triangles;
    log(`${result.slug.padEnd(26)} ${entity.source.revision.slice(0, 12)} ${String(result.glb.length).padStart(7)} B sha256 ${result.sha} = SHA256SUMS = asset map = pack.json = licence line; ${entity.source.author}; triangles ${t.detailed}/${t.lod1}/${t.hiddenByDefault} (detailed/lod1/hidden)${item.entity ? " = map" : " read from sealed GLB"}, three.js loader ${result.loaded.triangles}; ${result.measured.allBounds.size.join(' x ')} m; ${result.placed ? 'placed' : 'unplaced'}`);
  }

  const files = foundryFloorFiles(release);
  const pinList = [];
  const pin = async (path, bytes) => {
    const pinned = await writeMirrorFile(mirror, path, bytes);
    pinList.push(pinned);
    return pinned;
  };
  const pins = new Map();
  for (const result of results) pins.set(result.slug, { glb: await pin(files.model(result.slug), result.glb) });
  const licencePin = await pin(files.licence, licenceBytes);
  const additionalFiles = {};
  for (const [path, sha] of sums) if ((path.startsWith('licenses/') && path !== 'licenses/ASSET-LICENSE.txt') || PROVENANCE_FILES.has(path)) {
    const bytes = await readFile(join(scenePack, path));
    if (hashBytes(bytes) !== sha) throw new Error(`Additional licence or provenance differs from seal: ${path}`);
    additionalFiles[path] = bytes;
  }
  const archive = buildModelsArchive({ results, licenceBytes, release, additionalFiles });
  const archivePin = await pin(files.archive, archive);
  const archiveFiles = verifyArchive(archive, 'delivery');
  const downloads = [{
    profile: 'models',
    archive: files.archive.split('/').at(-1),
    bytes: archivePin.bytes,
    sha256: archivePin.sha256,
    files: Object.keys(archiveFiles.files).length,
    assets: results.length,
    path: archivePin.path,
    url: `${mirrorBase}${archivePin.path}`,
    contents: [`The ${results.length} model GLBs`, 'The pack’s licence text, naming every model, its revision and its SHA-256', 'Sealed asset metadata and replacement lineage where supplied', 'A delivery.json inventory with member hashes'],
    compatibility: `Standard glTF 2.0${results.every((result) => !result.measured.extensionsUsed.length) ? ' with no extensions' : ''}. ${lodSummary(results)} Engine import and runtime behavior must be checked for the chosen file; see the Blender/Unity handoff guide for its exact tested cases.`,
  }];

  const manifestFile = join(data, 'mirror-manifest.json');
  const manifest = await readJson(manifestFile);
  await writeJson(manifestFile, { ...manifest, files: syncGroup(manifest.files, 'path', `${foundryFloorDir(release)}/`, pinList) });
  const planFile = join(data, 'commons-build.json');
  const plan = await readJson(planFile);
  await writeJson(planFile, { ...plan, archives: syncGroup(plan.archives.map((path) => ({ path })), 'path', `packs/${FOUNDRY_FLOOR_ID}/`, [{ path: files.archive }]).map((entry) => entry.path) });

  const posters = await readJson(join(data, 'rig-posters.json')).catch(() => ({ posters: {} }));
  const assets = applyRigPosters(results.map((result) => foundryFloorAsset({ result, pins: pins.get(result.slug), release, licencePin })), FOUNDRY_FLOOR_ID, posters);
  const hidden = results.filter((result) => (result.entity.hideByDefault ?? []).length);
  const textured = results.filter((result) => result.measured.textures > 0).length;
  const named = (result) => (/^[A-Z]{2}/.test(displayName(result.slug)) ? displayName(result.slug) : displayName(result.slug).toLowerCase());
  const catalog = {
    schemaVersion: 1,
    id: FOUNDRY_FLOOR_ID,
    name: FOUNDRY_FLOOR_NAME,
    release,
    status: 'in-production',
    assetCount: assets.length,
    placedInScene: assets.filter((asset) => asset.placedInScene).length,
    acceptance: {
      statement: `This ${assets.length}-model pack combines the staged interior and campus deliveries. Its source pins, licence identities and downloaded bytes have been checked together. Those checks do not establish the owner’s visual or simulation acceptance; the pack stays in production until that review.`,
      source: 'Sealed pack.json source pins and credits, data/assets.json, data/campus-assets.json when present, and the licence text',
    },
    license: 'CC0-1.0',
    licenseScope: SCOPE,
    licenceNote: 'The licence text comes from the sealed Foundry Floor scene pack. It names every model, its saved revision, author attribution and the SHA-256 of its GLB, and is published here unchanged.',
    licence: { ...licencePin, url: `${mirrorBase}${licencePin.path}`, spdx: 'CC0-1.0', models: licenceLines.size },
    scenePack: { release, base: record.base, packJsonSha256: record.packJsonSha256, sha256sumsSha256: record.sha256sumsSha256, assetMapSha256: hashBytes(assetMapBytes) },
    conventions: {
      frame: 'Metres. Interior assets use +X forward, +Y up and +Z right. Campus assets retain the coordinate frames of their source models.',
      lod: lodSummary(results),
      hidden: `${hidden.length === 2 ? 'Two' : hidden.length} models carry parts the scene hides when it loads them: ${hidden.map((result) => `the ${named(result)} (${result.entity.hideByDefault.join(', ')})`).join(' and ')}. They are part of the file, and a plain viewer draws them.`,
      materials: `${textured ? `${textured} models use textures` : 'No model uses a texture'}; colours are material factors. The pack’s accent colours are invented for readability and are not any maker’s livery.`,
      clips: 'Animation clips carry no loop flags; the scene decides what loops.',
      source: 'Interior conventions come from data/assets.json; every figure on this page was read from its sealed GLB. Campus assets retain their source conventions.',
    },
    groups: FOUNDRY_FLOOR_GROUPS.filter(group => assets.some(asset => asset.group === group.id)).map(({ id, title }) => ({ id, title })),
    downloads,
    scene: { id: FOUNDRY_FLOOR_ID, name: 'Foundry Floor scene', href: '/scenes/foundry-floor/' },
    assets,
  };
  await writeJson(join(data, 'packs/foundry-floor.json'), catalog);
  log(`Staged ${pinList.length} files under ${foundryFloorDir(release)}/ (${pinList.reduce((sum, file) => sum + file.bytes, 0)} B): ${results.length} GLBs, the licence text (${licencePin.bytes} B sha256 ${licencePin.sha256}) and ${downloads[0].archive} (${archivePin.bytes} B sha256 ${archivePin.sha256}, ${downloads[0].files} members); wrote packs/foundry-floor.json with ${assets.length} models (${catalog.placedInScene} placed in the scene).`);
  return { results, catalog, pins: pinList };
}

async function main(argv = process.argv.slice(2)) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const mirror = option('--mirror', process.env.KILN_ASSET_MIRROR);
  const recorded = (await readJson(join(DATA, 'scene-packs.json')))[FOUNDRY_FLOOR_ID];
  const scenePack = option('--scene-pack', join(SITE, 'public', String(recorded?.base ?? '').replace(/^\/+/, '')));
  if (!mirror) throw new Error('Usage: node scripts/stage-foundry-floor.mjs --mirror DIR [--scene-pack DIR]  (run scripts/scene-pack.mjs first)');
  await mkdir(resolve(mirror), { recursive: true });
  await stageFoundryFloor({ scenePack: resolve(scenePack), mirror: resolve(mirror) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
