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

/**
 * Append one committed example to a frozen selection without reopening or reselecting older scenes.
 * Existing shared assets must be the exact selected revision; changing them requires the full selection workflow.
 * Only new assets need a local saved-revision store. This freezes inputs, never records visual approval or stages files.
 */
export async function appendHolodeckExample({ selection, holodeck, ref, example, stores, release = HOLODECK_RELEASE, packs = HOLODECK_PACKS, presentations = HOLODECK_ASSETS }) {
  if (!selection || selection.schemaVersion !== 1 || selection.licence !== 'CC0-1.0' || selection.versions !== 'final-only' || !selection.packs || !selection.assets) throw new Error('A frozen Holodeck selection is required');
  if (!/^holodeck-[a-z0-9-]+$/.test(release ?? '') || release === selection.release) throw new Error('Appending a pack requires a new release ID');
  if (!holodeck || !ref || !/^[a-z][a-z0-9-]{0,63}$/.test(example ?? '') || !stores || !Object.keys(stores).length) throw new Error('An explicit Holodeck repository, ref, example and stores are required');
  const spec = packs.find(pack => pack.scene === example && pack.id === `holodeck-${example}`);
  if (!spec || !Number.isSafeInteger(spec.expectedAssets) || spec.expectedAssets < 1) throw new Error(`No configured pack with an exact asset count for ${example}`);
  if (Object.hasOwn(selection.packs, spec.id)) throw new Error(`${spec.id} is already selected; append never replaces a pack`);
  const git = (...args) => execFileSync('git', ['-C', holodeck, ...args], { maxBuffer: 256 * 1024 * 1024 });
  const commit = git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).toString('utf8').trim();
  const path = `examples/${example}`, show = file => git('show', `${commit}:${path}/${file}`);
  const worldBytes = show('world/world.json'), world = json(worldBytes), manifest = json(show('example.json'));
  if (manifest.id !== example || !Number.isSafeInteger(manifest.sourceRevision) || manifest.sourceRevision < 0) throw new Error(`${example}: invalid example identity or source revision`);
  const list = world.scene?.assets;
  if (!Array.isArray(list) || list.length !== spec.expectedAssets) throw new Error(`${spec.id}: expected ${spec.expectedAssets} placed assets, found ${list?.length ?? 'none'}`);
  const result = structuredClone(selection), slugs = [], identities = new Map(), revisions = new Map();
  for (const [slug, record] of Object.entries(result.assets)) {
    const assetIdentity = `${record.collection}/${record.assetId}`;
    if (revisions.has(assetIdentity) && revisions.get(assetIdentity) !== record.revisionId) throw new Error(`${assetIdentity} has multiple selected revisions`);
    revisions.set(assetIdentity, record.revisionId);
    const identity = `${record.collection}/${record.assetId}/${record.revisionId}`;
    if (identities.has(identity)) throw new Error(`${identity} has two slugs in the frozen selection`);
    identities.set(identity, slug);
  }
  for (const asset of list) {
    const { collection, assetId, revisionId } = asset.provenance ?? {};
    if (collection !== 'project' || !/^a_[a-f0-9]{32}$/.test(assetId ?? '') || !/^r_[a-f0-9]{32}$/.test(revisionId ?? '')) throw new Error(`${spec.id}/${asset.id}: invalid provenance`);
    if (!/^assets\/imports\/[a-zA-Z0-9_-]+\.glb$/.test(asset.file ?? '')) throw new Error(`${spec.id}/${asset.id}: unsafe example GLB path`);
    const slug = holodeckSlug(spec.id, asset.id);
    if (!Object.hasOwn(presentations, slug)) throw new Error(`No gallery presentation for ${slug}`);
    if (slugs.includes(slug)) throw new Error(`${spec.id}: duplicate slug ${slug}`);
    const assetIdentity = `${collection}/${assetId}`, identity = `${assetIdentity}/${revisionId}`, existing = result.assets[slug];
    if (revisions.has(assetIdentity) && revisions.get(assetIdentity) !== revisionId) throw new Error(`${assetIdentity}: shared revision differs; append cannot replace an existing selection`);
    if (existing && (existing.collection !== collection || existing.assetId !== assetId || existing.revisionId !== revisionId)) throw new Error(`${slug}: shared revision differs; append cannot replace an existing selection`);
    if (identities.has(identity) && identities.get(identity) !== slug) throw new Error(`${identity} has two slugs`);
    const record = existing ?? await revisionRecord(stores, assetId, revisionId);
    verifyBytes(show(asset.file), record.canonical, `${spec.id}/${asset.id} canonical GLB`);
    record.placements = [...(record.placements ?? []), { pack: spec.id, id: asset.id }];
    result.assets[slug] = record;
    identities.set(identity, slug);
    revisions.set(assetIdentity, revisionId);
    slugs.push(slug);
  }
  result.release = release;
  result.packs[spec.id] = {
    scene: spec.scene,
    source: { kind: 'holodeck-example', ref, commit, path, sourceRevision: manifest.sourceRevision, worldSha256: hashBytes(worldBytes) },
    assets: slugs,
  };
  return result;
}

/**
 * Move one selected committed example to a newer Holodeck commit without reselecting other scenes. Records the example
 * still places at their frozen revision are kept as they are, so their stores need not be present. A changed revision of
 * the example's own asset must descend from the selected one; a changed shared revision is refused, as in append.
 */
export async function repointHolodeckExample({ selection, holodeck, ref, example, stores, release = HOLODECK_RELEASE, packs = HOLODECK_PACKS, presentations = HOLODECK_ASSETS }) {
  if (!selection || selection.schemaVersion !== 1 || selection.licence !== 'CC0-1.0' || selection.versions !== 'final-only' || !selection.packs || !selection.assets) throw new Error('A frozen Holodeck selection is required');
  if (!/^holodeck-[a-z0-9-]+$/.test(release ?? '') || release === selection.release) throw new Error('Repointing a pack requires a new release ID');
  if (!holodeck || !ref || !/^[a-z][a-z0-9-]{0,63}$/.test(example ?? '') || !stores) throw new Error('An explicit Holodeck repository, ref, example and stores are required');
  const spec = packs.find(pack => pack.scene === example && pack.id === `holodeck-${example}`);
  if (!spec || !Number.isSafeInteger(spec.expectedAssets) || spec.expectedAssets < 1) throw new Error(`No configured pack with an exact asset count for ${example}`);
  const previous = selection.packs[spec.id], path = `examples/${example}`;
  if (!previous) throw new Error(`${spec.id} is not selected; append it instead`);
  if (previous.source?.kind !== 'holodeck-example' || previous.source.path !== path) throw new Error(`${spec.id} is not a committed example`);
  const git = (...args) => execFileSync('git', ['-C', holodeck, ...args], { maxBuffer: 256 * 1024 * 1024 });
  const commit = git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).toString('utf8').trim();
  const show = file => git('show', `${commit}:${path}/${file}`);
  const worldBytes = show('world/world.json'), world = json(worldBytes), manifest = json(show('example.json'));
  if (manifest.id !== example || !Number.isSafeInteger(manifest.sourceRevision)) throw new Error(`${example}: invalid example identity or source revision`);
  if (manifest.sourceRevision < previous.source.sourceRevision) throw new Error(`${example}: source revision cannot go backward from ${previous.source.sourceRevision}`);
  // Maintainer repairs can replace descendant assets in a bundled example without creating an authoring-world revision.
  if (commit === previous.source.commit || hashBytes(worldBytes) === previous.source.worldSha256) throw new Error(`${example}: repointing needs a newer committed example with changed world bytes`);
  const list = world.scene?.assets;
  if (!Array.isArray(list) || list.length !== spec.expectedAssets) throw new Error(`${spec.id}: expected ${spec.expectedAssets} placed assets, found ${list?.length ?? 'none'}`);

  // Take the pack out of the frozen selection; what other packs still place is shared and must stay as it is.
  const result = structuredClone(selection), prior = {};
  for (const slug of previous.assets) {
    const record = result.assets[slug];
    record.placements = record.placements.filter(placement => placement.pack !== spec.id);
    if (!record.placements.length) { prior[slug] = record; delete result.assets[slug]; }
  }
  const revisions = new Map(Object.values(result.assets).map(record => [`${record.collection}/${record.assetId}`, record.revisionId]));
  const slugs = [];
  for (const asset of list) {
    const { collection, assetId, revisionId } = asset.provenance ?? {};
    if (collection !== 'project' || !/^a_[a-f0-9]{32}$/.test(assetId ?? '') || !/^r_[a-f0-9]{32}$/.test(revisionId ?? '')) throw new Error(`${spec.id}/${asset.id}: invalid provenance`);
    if (!/^assets\/imports\/[a-zA-Z0-9_-]+\.glb$/.test(asset.file ?? '')) throw new Error(`${spec.id}/${asset.id}: unsafe example GLB path`);
    const slug = holodeckSlug(spec.id, asset.id);
    if (!Object.hasOwn(presentations, slug)) throw new Error(`No gallery presentation for ${slug}`);
    if (slugs.includes(slug)) throw new Error(`${spec.id}: duplicate slug ${slug}`);
    const assetIdentity = `${collection}/${assetId}`, shared = result.assets[slug], kept = prior[slug];
    if (revisions.has(assetIdentity) && revisions.get(assetIdentity) !== revisionId) throw new Error(`${assetIdentity}: shared revision differs; repoint cannot replace another pack's selection`);
    if (shared && (shared.collection !== collection || shared.assetId !== assetId || shared.revisionId !== revisionId)) throw new Error(`${slug}: shared revision differs; repoint cannot replace another pack's selection`);
    let record = shared;
    if (!record && kept && kept.collection === collection && kept.assetId === assetId && kept.revisionId === revisionId) record = { ...kept, placements: [] };
    if (!record) {
      record = await revisionRecord(stores, assetId, revisionId);
      if (kept && (kept.assetId !== assetId || !(await descendsFrom(stores, record, kept.revisionId)))) throw new Error(`${slug}: ${revisionId} does not descend from the selected ${kept.revisionId}`);
    }
    verifyBytes(show(asset.file), record.canonical, `${spec.id}/${asset.id} canonical GLB`);
    record.placements = [...record.placements ?? [], { pack: spec.id, id: asset.id }];
    result.assets[slug] = record;
    revisions.set(assetIdentity, revisionId);
    slugs.push(slug);
  }
  // Keep the frozen order of records and placements, so the selection diff shows only what the example changed.
  const order = Object.keys(selection.assets);
  const rank = (slug, placement) => { const index = (selection.assets[slug]?.placements ?? []).findIndex(p => p.pack === placement.pack && p.id === placement.id); return index < 0 ? Infinity : index; };
  for (const [slug, record] of Object.entries(result.assets)) record.placements.sort((a, b) => { const x = rank(slug, a), y = rank(slug, b); return x === y ? 0 : x - y; });
  result.assets = Object.fromEntries([...order.filter(slug => Object.hasOwn(result.assets, slug)), ...Object.keys(result.assets).filter(slug => !order.includes(slug))].map(slug => [slug, result.assets[slug]]));
  result.release = release;
  result.packs[spec.id] = {
    scene: spec.scene,
    source: { kind: 'holodeck-example', ref, commit, path, sourceRevision: manifest.sourceRevision, worldSha256: hashBytes(worldBytes) },
    assets: slugs,
  };
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = { stores: {} };
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--store') { const [name, dir] = value.split(/=(.*)/s); options.stores[name] = await realpath(dir); }
    else if (['--courtyard', '--holodeck', '--ref', '--crescent-ref', '--out', '--append-example', '--repoint-example', '--selection'].includes(flag)) options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (options.appendExample && options.repointExample) throw new Error('Choose one of --append-example and --repoint-example');
  if (options.selection && !options.appendExample && !options.repointExample) throw new Error('--selection requires --append-example or --repoint-example');
  const frozen = async () => json(await readFile(resolve(options.selection ?? resolve(import.meta.dirname, '../../packs/holodeck/selection.json'))));
  const selection = options.appendExample ? await appendHolodeckExample({ ...options, example: options.appendExample, selection: await frozen() })
    : options.repointExample ? await repointHolodeckExample({ ...options, example: options.repointExample, selection: await frozen() })
    : await selectHolodeck(options);
  const out = resolve(options.out ?? resolve(import.meta.dirname, '../../packs/holodeck/selection.json'));
  await writeFile(out, JSON.stringify(selection, null, 2) + '\n');
  console.log(JSON.stringify({ out, packs: Object.fromEntries(Object.entries(selection.packs).map(([id, pack]) => [id, pack.assets.length])), uniqueRevisions: Object.keys(selection.assets).length }, null, 2));
}
