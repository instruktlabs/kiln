import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const sameBox = (a, b) => (a === null || b === null ? a === b : ['min', 'max', 'size'].every((key) => a[key].every((value, axis) => Math.abs(value - b[key][axis]) <= TOLERANCE)));
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The model lines of the pack's licence text: path, slug, revision, author folder and SHA-256. */
export function parseLicence(text) {
  if (!/^SPDX-License-Identifier: CC0-1\.0$/m.test(text)) throw new Error('The licence text does not state SPDX-License-Identifier: CC0-1.0; stopping rather than relabelling the pack');
  if (!/to the extent of the owner's rights/.test(text.replace(/\s+/g, ' '))) throw new Error('The licence text does not limit the designation to the extent of the owner\'s rights');
  const lines = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^(models\/[a-z0-9-]+\.glb) {2}([a-z0-9-]+) {2}Kiln revision (r_[0-9a-f]{32}) {2}showcase\/authors\/([a-z0-9-]+) {2}SHA-256 ([0-9a-f]{64})$/.exec(line);
    if (!match) continue;
    if (lines.has(match[1])) throw new Error(`The licence text lists ${match[1]} twice`);
    lines.set(match[1], { slug: match[2], revision: match[3], author: match[4], sha256: match[5] });
  }
  const release = /^Release: (\S+)$/m.exec(text)?.[1] ?? null;
  return { lines, release };
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
  const slug = entity.asset;
  const path = `models/${slug}.glb`;
  if (entity.status !== 'accepted') throw new Error(`${key}: the asset map marks it ${entity.status}, not accepted`);
  if (entity.glb !== path) throw new Error(`${key}: the asset map's GLB is ${entity.glb}, not ${path}`);
  const glb = await readFile(join(scenePack, path));
  const sha = sha256Of(glb);
  if (sums.get(path) !== sha) throw new Error(`${slug}: the scene pack's SHA256SUMS seals ${sums.get(path)}, the file is ${sha}`);
  if (entity.pins?.bytes !== glb.length || entity.pins?.sha256 !== sha) throw new Error(`${slug}: the asset map pins ${entity.pins?.bytes} B ${entity.pins?.sha256}, the file is ${glb.length} B ${sha}`);
  const source = pack.source.models[key];
  if (!source || source.revision !== entity.source.revision || source.bytes !== glb.length || source.sha256 !== sha) throw new Error(`${slug}: pack.json's source pin ${JSON.stringify(source)} differs from the asset map and the file`);
  const line = licenceLines.get(path);
  if (!line || line.slug !== slug || line.revision !== entity.source.revision || line.author !== entity.source.author || line.sha256 !== sha) throw new Error(`${slug}: the licence text's line ${JSON.stringify(line)} does not name this model, revision ${entity.source.revision}, author ${entity.source.author} and SHA-256 ${sha}`);
  const credit = pack.credits.find((entry) => entry.name === `${slug} (Kiln-authored model)`);
  if (!credit || credit.licence !== 'CC0-1.0' || !credit.source.includes(entity.source.revision) || !credit.source.endsWith(`showcase/authors/${entity.source.author}`)) throw new Error(`${slug}: pack.json has no CC0-1.0 credit naming ${entity.source.revision} and ${entity.source.author}`);
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
  // Every triangle the reader counted is one three.js's loader (the site's viewer) would draw: the file has no
  // visibility flags, so a plain viewer draws the detailed parts, lod1 and the hidden parts together.
  const loaded = await loaderDraws(glb);
  if (loaded.triangles !== measured.triangles.total) throw new Error(`${slug}: three.js's loader draws ${loaded.triangles} triangles, the reader counts ${measured.triangles.total}`);
  const lodClass = entity.lod ? assetMap.lod.classes[entity.lod] : null;
  return { key, entity, slug, glb, sha, measured, loaded, placed: placed === 1, unplacedWhy: unplaced[0]?.why ?? null, lodClass, credit };
}

/** The pack archive: every model GLB and the licence text, sealed by an inventory. Same inputs, same bytes. */
export function buildModelsArchive({ results, licenceBytes, release }) {
  const members = {};
  const files = {};
  const assets = [];
  for (const { slug, glb, sha, entity, measured, placed } of results) {
    const model = `models/${slug}.glb`;
    members[model] = glb;
    files[model] = { bytes: glb.length, sha256: sha };
    assets.push({ slug, name: displayName(slug), revisionId: entity.source.revision, model, placedInScene: placed, triangles: { detailed: measured.triangles.detailed, lod1: measured.triangles.lod1, hiddenByDefault: measured.triangles.hiddenByDefault } });
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
    author: entity.source.author,
    placedInScene: placed,
    ...(unplacedWhy ? { unplacedWhy } : {}),
    metrics: {
      // What a plain glTF viewer draws: every triangle in the file.
      triangles: measured.triangles.total,
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
    lod: measured.hasLod1 ? { class: entity.lod, nearMetres: lodClass?.nearM ?? null, farMetres: lodClass?.farM ?? null } : null,
    hideByDefault: entity.hideByDefault ?? [],
    runtimeDownload: { ...pins.glb, url: `${ASSET_BASE}${pins.glb.path}`, archive: foundryFloorFiles(release).archive, member: `models/${slug}.glb` },
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
  const entities = Object.entries(assetMap.entities);
  if (licenceLines.size !== entities.length || Object.keys(pack.source.models).length !== entities.length || pack.credits.length !== entities.length) {
    throw new Error(`The asset map has ${entities.length} models, the licence text ${licenceLines.size}, pack.json's source pins ${Object.keys(pack.source.models).length} and its credits ${pack.credits.length}`);
  }
  log(`${FOUNDRY_FLOOR_NAME} ${release}: SHA256SUMS ${record.sha256sumsSha256.slice(0, 12)} and pack.json ${record.packJsonSha256.slice(0, 12)} are the recorded ones; data/assets.json ${hashBytes(assetMapBytes).slice(0, 12)} and the licence text ${hashBytes(licenceBytes).slice(0, 12)} are sealed; ${statements.length} licence statements, all CC0-1.0.`);

  const results = [];
  for (const [key, entity] of entities) {
    const result = await verifyModel({ key, entity, scenePack, sums, pack, licenceLines, assetMap });
    results.push(result);
    const t = result.measured.triangles;
    log(`${result.slug.padEnd(26)} ${entity.source.revision.slice(0, 12)} ${String(result.glb.length).padStart(7)} B sha256 ${result.sha} = SHA256SUMS = asset map = pack.json = licence line; ${entity.source.author}; triangles ${t.detailed}/${t.lod1}/${t.hiddenByDefault} (detailed/lod1/hidden) = map, three.js loader ${result.loaded.triangles}; ${result.measured.allBounds.size.join(' x ')} m; ${result.placed ? 'placed' : 'unplaced'}`);
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
  const archive = buildModelsArchive({ results, licenceBytes, release });
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
    contents: [`The ${results.length} model GLBs`, 'The pack’s licence text, naming every model, its revision and its SHA-256', 'A delivery.json inventory with member hashes'],
    compatibility: `Standard glTF 2.0${results.every((result) => !result.measured.extensionsUsed.length) ? ' with no extensions' : ''}. A file with a far form keeps it beside its detailed parts as a node named lod1, and every part is visible, so a plain viewer draws both; the far form lies inside the detailed parts’ bounding box. Other engines are not qualified by this download.`,
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
      statement: `The pack’s asset map marks all ${assets.length} models accepted: each was accepted by the scene coordinator’s review of its author’s delivery, and the scene’s intake checked its bytes and SHA-256. The owner has not reviewed this pack; it stays in production until then.`,
      source: 'data/assets.json (status accepted for every entity) and the Foundry Floor FF2 report, intake section',
    },
    license: 'CC0-1.0',
    licenseScope: SCOPE,
    licenceNote: 'The licence text was written by the Foundry Floor scene’s staging, because the author folders ship none. It names every model, its saved revision, its author folder and the SHA-256 of its GLB, and is published here unchanged.',
    licence: { ...licencePin, url: `${mirrorBase}${licencePin.path}`, spdx: 'CC0-1.0', models: licenceLines.size },
    scenePack: { release, base: record.base, packJsonSha256: record.packJsonSha256, sha256sumsSha256: record.sha256sumsSha256, assetMapSha256: hashBytes(assetMapBytes) },
    conventions: {
      frame: 'Metres. +X is forward, +Y up and +Z right.',
      lod: `${results.filter((result) => result.measured.hasLod1).length} of the ${results.length} models keep a simpler far form in the same file, as a node named lod1. The file has no visibility flags, so a plain glTF viewer draws the detailed parts and lod1 together; lod1 lies inside the detailed parts’ bounding box. The Foundry Floor scene shows the detailed parts near and lod1 far.`,
      hidden: `${hidden.length === 2 ? 'Two' : hidden.length} models carry parts the scene hides when it loads them: ${hidden.map((result) => `the ${named(result)} (${result.entity.hideByDefault.join(', ')})`).join(' and ')}. They are part of the file, and a plain viewer draws them.`,
      materials: `${textured ? `${textured} models use textures` : 'No model uses a texture'}; colours are material factors. The pack’s accent colours are invented for readability and are not any maker’s livery.`,
      clips: 'Animation clips carry no loop flags; the scene decides what loops.',
      source: 'The conventions are the pack’s own (data/assets.json); every figure on this page was read from the GLBs.',
    },
    groups: FOUNDRY_FLOOR_GROUPS.map(({ id, title }) => ({ id, title })),
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
