import { execFileSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSavedMaterialDependency } from './asset-delivery.mjs';
import { hashBytes, verifyBytes } from './mirror-core.mjs';
import { HOLODECK_ASSETS, HOLODECK_PACKS, HOLODECK_RELEASE, holodeckSlug } from './holodeck-spec.mjs';

/**
 * Freeze the exact Kiln revisions each Holodeck scene places into `packs/holodeck/selection.json`. Every input is
 * read-only: Holodeck's bundled Tidemark example and the Cove modules' provenance at a named Holodeck ref, its bundled
 * Crescent Cove example at another (both read with `git show`, never checked out), the courtyard world's
 * `world/world.json` placements and the Kiln stores that hold the saved revisions. A placed GLB must be
 * byte-identical to its saved revision's canonical `asset.glb`.
 *
 *   node scripts/select-holodeck.mjs --courtyard WORLD --holodeck REPO --ref main --crescent-ref COMMIT \
 *     --store island-trial=DIR --store holodeck-assets=DIR --store courtyard-plaza=DIR --store tropical-island=DIR
 */

const json = (bytes) => JSON.parse(bytes.toString('utf8'));
const seal = (bytes) => ({ bytes: bytes.length, sha256: hashBytes(bytes) });
const TIDEMARK = 'examples/tidemark';
const CRESCENT_COVE = 'examples/crescent-cove';
const COVE_MODULES = ['structure', 'canopy', 'seating', 'hearth', 'planting', 'rug', 'lamp', 'moodboard'];

async function findRevision(stores, assetId, revisionId) {
  const found = [];
  for (const [name, root] of Object.entries(stores)) {
    const dir = join(root, assetId, 'revisions', revisionId);
    try { found.push({ name, dir, manifest: await readFile(join(dir, 'manifest.json')) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!found.length) throw new Error(`No store holds ${assetId}/${revisionId}`);
  if (found.some((entry) => !entry.manifest.equals(found[0].manifest))) throw new Error(`Stores disagree about ${assetId}/${revisionId}`);
  return found[0];
}

async function revisionRecord(stores, assetId, revisionId) {
  const { name, dir, manifest: manifestBytes } = await findRevision(stores, assetId, revisionId);
  const manifest = json(manifestBytes);
  if (manifest.assetId !== assetId || manifest.revisionId !== revisionId || !manifest.editable) throw new Error(`Saved revision identity/editability mismatch: ${assetId}/${revisionId}`);
  const files = {};
  for (const [file, record] of Object.entries(manifest.files)) files[file] = verifyBytes(await readFile(join(dir, file)), { bytes: record.bytes, sha256: record.sha256.replace(/^sha256:/, '') }, `${revisionId}/${file}`);
  for (const file of ['asset.glb', 'source.kiln.js']) if (!files[file]) throw new Error(`${assetId}/${revisionId} lacks ${file}`);
  // A revision that uses saved materials carries their closure beside the manifest; staging verifies it by this seal.
  const materials = (manifest.build?.dependencies ?? []).some(isSavedMaterialDependency) ? seal(await readFile(join(dir, 'materials.kiln.json'))) : null;
  return {
    store: name,
    collection: 'project',
    assetId,
    revisionId,
    ...(manifest.parentRevision ? { parentRevision: manifest.parentRevision } : {}),
    manifest: seal(manifestBytes),
    source: seal(files['source.kiln.js']),
    canonical: seal(files['asset.glb']),
    preview: files['preview.png'] ? seal(files['preview.png']) : null,
    ...(materials ? { materials } : {}),
  };
}

/** Whether `record` descends from `ancestor` through saved parent revisions of the same asset (at most 32 steps). */
async function descendsFrom(stores, record, ancestor) {
  let parent = record.parentRevision;
  for (let step = 0; parent && step < 32; step++) {
    if (parent === ancestor) return true;
    parent = json((await findRevision(stores, record.assetId, parent)).manifest).parentRevision;
  }
  return false;
}

export async function selectHolodeck({ courtyard, holodeck, ref, crescentRef, stores }) {
  if (!courtyard || !holodeck || !ref || !crescentRef || !stores || !Object.keys(stores).length) throw new Error('An explicit courtyard world, Holodeck repository, Holodeck refs and stores are required');
  const git = (...args) => execFileSync('git', ['-C', holodeck, ...args], { maxBuffer: 256 * 1024 * 1024 });
  const resolveRef = (name) => git('rev-parse', `${name}^{commit}`).toString('utf8').trim();
  const commit = resolveRef(ref);
  const show = (path, at = commit) => git('show', `${at}:${path}`);
  const placements = { 'holodeck-tidemark': [], 'holodeck-courtyard': [], 'holodeck-cove': [], 'holodeck-crescent-cove': [] };
  const sources = {};
  // Tidemark and Crescent Cove are walkable scenes Holodeck bundles under `examples/`; their GLBs sit beside the world file.
  for (const [pack, path, name] of [['holodeck-tidemark', TIDEMARK, ref], ['holodeck-crescent-cove', CRESCENT_COVE, crescentRef]]) {
    const at = resolveRef(name), worldBytes = show(`${path}/world/world.json`, at), example = json(show(`${path}/example.json`, at));
    sources[pack] = { kind: 'holodeck-example', ref: name, commit: at, path, sourceRevision: example.sourceRevision, worldSha256: hashBytes(worldBytes) };
    for (const asset of json(worldBytes).scene.assets) placements[pack].push({ id: asset.id, ...asset.provenance, placed: show(`${path}/${asset.file}`, at) });
  }
  const worldBytes = await readFile(join(courtyard, 'world/world.json')), world = json(worldBytes);
  sources['holodeck-courtyard'] = { kind: 'holodeck-world', revision: world.revision, worldSha256: hashBytes(worldBytes) };
  for (const asset of world.scene.assets) placements['holodeck-courtyard'].push({ id: asset.id, ...asset.provenance, placed: await readFile(join(courtyard, asset.file)) });
  for (const module of COVE_MODULES) {
    const provenance = json(show(`assets/cove/modules/${module}/provenance.json`));
    placements['holodeck-cove'].push({ id: module, collection: provenance.collection, assetId: provenance.assetId, revisionId: provenance.revisionId, placed: show(`public/assets/cove-modules/${module}.glb`) });
  }
  sources['holodeck-cove'] = { kind: 'holodeck-modules', ref, commit, files: 'assets/cove/modules/*/provenance.json, public/assets/cove-modules/*.glb' };

  // Packs deliver final versions only. The Cove pack is read first; a scene that still places an earlier revision of
  // one of its modules lists the final revision instead, provided the final revision descends from the placed one and
  // the placed GLB is that earlier revision's canonical asset. Each module keeps one page shared by every scene.
  const assets = {}, packs = {}, finalByAsset = new Map();
  const order = [...HOLODECK_PACKS].sort((a, b) => Number(b.id === 'holodeck-cove') - Number(a.id === 'holodeck-cove'));
  for (const spec of order) {
    const list = placements[spec.id];
    if (list.length !== spec.expectedAssets) throw new Error(`${spec.id}: expected ${spec.expectedAssets} placed assets, found ${list.length}`);
    const slugs = [], earlier = [];
    for (const placement of list) {
      if (placement.collection !== 'project' || !/^a_[a-f0-9]{32}$/.test(placement.assetId) || !/^r_[a-f0-9]{32}$/.test(placement.revisionId)) throw new Error(`${spec.id}/${placement.id}: invalid provenance`);
      const slug = holodeckSlug(spec.id, placement.id);
      if (!HOLODECK_ASSETS[slug]) throw new Error(`No gallery presentation for ${slug}`);
      if (slugs.includes(slug)) throw new Error(`${spec.id}: duplicate slug ${slug}`);
      const final = finalByAsset.get(placement.assetId);
      let record;
      if (final && final.revisionId !== placement.revisionId) {
        if (!(await descendsFrom(stores, final, placement.revisionId))) throw new Error(`${spec.id}/${placement.id}: the final revision ${final.revisionId} does not descend from the placed ${placement.revisionId}`);
        const placed = await revisionRecord(stores, placement.assetId, placement.revisionId);
        if (hashBytes(placement.placed) !== placed.canonical.sha256) throw new Error(`${spec.id}/${placement.id}: the placed GLB is not the saved canonical asset.glb`);
        earlier.push({ id: placement.id, slug, placedRevisionId: placement.revisionId, finalRevisionId: final.revisionId });
        record = final;
      } else {
        record = assets[slug] ?? await revisionRecord(stores, placement.assetId, placement.revisionId);
        if (record.assetId !== placement.assetId || record.revisionId !== placement.revisionId) throw new Error(`${slug} names two revisions`);
        if (hashBytes(placement.placed) !== record.canonical.sha256) throw new Error(`${spec.id}/${placement.id}: the placed GLB is not the saved canonical asset.glb`);
      }
      record.placements = [...(record.placements ?? []), { pack: spec.id, id: placement.id }];
      assets[slug] = record;
      if (spec.id === 'holodeck-cove') finalByAsset.set(record.assetId, record);
      slugs.push(slug);
    }
    packs[spec.id] = { scene: spec.scene, source: sources[spec.id], assets: slugs, ...(earlier.length ? { sceneStillPlacesEarlier: earlier } : {}) };
  }
  const ordered = Object.fromEntries(HOLODECK_PACKS.map((spec) => [spec.id, packs[spec.id]]));
  for (const record of Object.values(assets)) {
    const identities = Object.values(assets).filter((other) => other.assetId === record.assetId && other.revisionId === record.revisionId);
    if (identities.length !== 1) throw new Error(`${record.assetId}/${record.revisionId} has two slugs`);
  }
  return { schemaVersion: 1, release: HOLODECK_RELEASE, licence: 'CC0-1.0', versions: 'final-only', packs: ordered, assets };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = { stores: {} };
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--store') { const [name, dir] = value.split(/=(.*)/s); options.stores[name] = await realpath(dir); }
    else if (['--courtyard', '--holodeck', '--ref', '--crescent-ref', '--out'].includes(flag)) options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  const selection = await selectHolodeck(options);
  const out = resolve(options.out ?? resolve(import.meta.dirname, '../../packs/holodeck/selection.json'));
  await writeFile(out, JSON.stringify(selection, null, 2) + '\n');
  console.log(JSON.stringify({ out, packs: Object.fromEntries(Object.entries(selection.packs).map(([id, pack]) => [id, pack.assets.length])), uniqueRevisions: Object.keys(selection.assets).length }, null, 2));
}
