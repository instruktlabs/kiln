// Build a new Cabin in the Woods site archive from the published one by swapping named models for saved child revisions.
//
// The Cabin site archive (src/data/cabin-woods-site.json) is not a kiln.scene-pack/1 pack: it is the whole output of
// scripts/stage-cabin-woods.mjs (the scene's web build, its maintained source, and the catalog's models, sources and
// downloads), sealed by scripts/stage-cabin-site.mjs. So a swap rebuilds the stager's own inputs from the published
// archive: the scene's built files byte for byte (compiled code included), its maintained source, and every selected
// revision from saved stores. Only the swapped models change: their runtime GLB and sidecar (the `kiln-runtime`
// derivation of scene-pack-swap.mjs), their entries in the scene's woodland collection, and the scene's runtime pin.
// The stager then regenerates every record that names them. With no swaps and the published release it reproduces the
// published archive except the members that name the selection hash (`--proof`).
//
// Run from site/ with bun (the derivation loads the engine source):
//   bun scripts/cabin-site-swap.mjs --swaps LIST.json --inputs DIR --store DIR --archive SITE.zip --work DIR [--mirror DIR]
//   bun scripts/cabin-site-swap.mjs --proof --store DIR --archive SITE.zip --work DIR
// --inputs is the directory the list's `file` paths are relative to; --store is a saved-revision store (assets/kiln,
// repeatable) holding every unswapped revision; --work receives the rebuilt inputs, a scratch site and the staged
// folder. --mirror seals the staged folder as packs/cabin-woods-psx-horror/<release>/cabin-woods-psx-horror-site.zip.
// Tracked files are not written (the stager's immutable source records excepted, with --sources).
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath, hashBytes, verifyArchive } from './mirror-core.mjs';
import { parseSwapList, readStandalone } from './scene-pack-swap.mjs';

export const CABIN_ID = 'cabin-woods-psx-horror';
const SITE = resolve(import.meta.dirname, '..');
const fail = (message) => { throw new Error(message); };
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
/** Re-encode a parsed JSON member and require the published bytes back, so a rewrite changes only what it names. */
function reencodable(bytes, name) {
  const value = json(bytes);
  if (!encode(value).equals(Buffer.from(bytes))) fail(`${name} does not re-encode to its published bytes`);
  return value;
}
const posix = (path) => path.split('\\').join('/');

/**
 * Write the stager's inputs under `work` from the published archive `files` (path to bytes), the tracked `catalog`,
 * saved revision `stores` and the parsed `swaps` (each `member` is `models/<slug>.glb`). Returns their paths and the
 * changes made to the scene's own data.
 */
export async function rebuildCabinInputs({ files, catalog, stores, swaps = [], release, work }) {
  const get = (path) => files.get(path) ?? fail(`The archive has no ${path}`);
  const pack = json(get('pack.json'));
  const collectionBytes = get('web/woodland/collection.json');
  const collection = reencodable(collectionBytes, 'web/woodland/collection.json');
  const keyOf = new Map(Object.entries(collection.assets).map(([key, entry]) => [entry.assetId, key]));
  const bySlug = new Map();
  for (const swap of swaps) {
    const slug = /^models\/([a-z0-9-]+)\.glb$/.exec(swap.member)?.[1] ?? fail(`${swap.member}: a Cabin swap names models/<slug>.glb`);
    if (bySlug.has(slug)) fail(`${slug}: swapped twice`);
    bySlug.set(slug, swap);
  }
  const workspace = work, scene = join(work, 'scene'), source = join(work, 'source');
  await rm(work, { recursive: true, force: true });
  const put = async (path, bytes) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); };
  const nextCollection = structuredClone(collection), woodland = new Map(), removed = new Set(), selection = { schemaVersion: 1, assets: {}, materials: {}, materialSeals: {} };
  const runtimeFiles = [];
  for (const asset of catalog.assets) {
    const key = keyOf.get(asset.assetId) ?? fail(`${asset.slug}: not in the scene collection`);
    const entry = collection.assets[key], swap = bySlug.get(asset.slug);
    if (entry.revisionId !== asset.revisionId) fail(`${asset.slug}: the catalog names ${asset.revisionId}, the scene ${entry.revisionId}`);
    let revisionId = entry.revisionId, from, runtime, metadata;
    if (swap) {
      bySlug.delete(asset.slug);
      if (swap.previous.revision !== entry.revisionId || swap.previous.sha256 !== entry.runtimeSha256) fail(`${asset.slug}: the scene holds ${entry.revisionId} (${entry.runtimeSha256}), not the swap's previous pin`);
      if (swap.manifest?.assetId !== asset.assetId || swap.manifest.parentRevision !== entry.revisionId) fail(`${asset.slug}: ${swap.revision} is not a saved child of ${entry.revisionId}`);
      if (swap.runtimeMetadata?.name !== `${asset.slug}.kiln-metadata.json`) fail(`${asset.slug}: the runtime sidecar must be ${asset.slug}.kiln-metadata.json`);
      if (entry.url !== `./assets/${key}-${entry.runtimeSha256.slice(0, 12)}.glb`) fail(`${asset.slug}: the scene model name does not follow <key>-<sha256 prefix>.glb`);
      revisionId = swap.revision; from = dirname(swap.fileAbsolute); runtime = swap.bytes; metadata = swap.runtimeMetadata.bytes;
    } else {
      from = stores.map((store) => join(store, asset.assetId, 'revisions', revisionId)).find((dir) => existsSync(join(dir, 'manifest.json'))) ?? fail(`${asset.slug}: ${revisionId} is in no store`);
      runtime = get(`web/woodland/${entry.url.slice(2)}`); metadata = get(`web/woodland/${entry.metadataURL.slice(2)}`);
    }
    const target = join(workspace, 'assets/kiln', asset.assetId, 'revisions', revisionId);
    const manifestBytes = await readFile(join(from, 'manifest.json')), manifest = json(manifestBytes);
    if (manifest.assetId !== asset.assetId || manifest.revisionId !== revisionId) fail(`${asset.slug}: ${from} holds ${manifest.assetId}/${manifest.revisionId}`);
    await put(join(target, 'manifest.json'), manifestBytes);
    for (const name of [...Object.keys(manifest.files), 'materials.kiln.json']) {
      const file = join(from, assetPath(name));
      if (name === 'materials.kiln.json' && !existsSync(file)) continue;
      await put(join(target, name), await readFile(file));
    }
    const read = (name) => readFile(join(target, name));
    const canonical = await read('asset.glb'), sourceBytes = await read('source.kiln.js');
    const materials = existsSync(join(target, 'materials.kiln.json')) ? await read('materials.kiln.json') : null;
    let modelURL = entry.url;
    if (swap) {
      const changed = {
        revisionId, sourceRef: `p_${hashBytes(sourceBytes).slice(0, 12)}`, canonicalSha256: hashBytes(canonical), runtimeSha256: hashBytes(runtime),
        sourceSha256: hashBytes(sourceBytes), manifestSha256: hashBytes(manifestBytes),
        ...(Object.hasOwn(entry, 'materialsSha256') ? { materialsSha256: materials ? hashBytes(materials) : fail(`${asset.slug}: the child has no materials.kiln.json`) } : {}),
        sha256: hashBytes(runtime), bytes: runtime.length, url: `./assets/${key}-${hashBytes(runtime).slice(0, 12)}.glb`,
        metadataSha256: hashBytes(metadata), metadataBytes: metadata.length,
      };
      if (entry.sourceRef !== `p_${entry.sourceSha256.slice(0, 12)}`) fail(`${asset.slug}: the scene sourceRef does not follow p_<source sha256 prefix>`);
      for (const [field, value] of Object.entries(changed)) if (!Object.hasOwn(entry, field)) fail(`${asset.slug}: the scene entry has no ${field}`); else nextCollection.assets[key][field] = value;
      removed.add(`web/woodland/${entry.url.slice(2)}`);
      woodland.set(`web/woodland/${entry.url.slice(2)}`, { path: `web/woodland/${changed.url.slice(2)}`, bytes: runtime });
      woodland.set(`web/woodland/${entry.metadataURL.slice(2)}`, { path: `web/woodland/${entry.metadataURL.slice(2)}`, bytes: metadata });
      modelURL = changed.url;
    }
    const runtimeFile = `scene/build/web/woodland/${modelURL.slice(2)}`, metadataFile = `scene/build/web/woodland/${entry.metadataURL.slice(2)}`;
    selection.assets[key] = {
      name: asset.name, description: asset.description, category: asset.category, collection: asset.collection, assetId: asset.assetId, revisionId,
      sourceRef: swap ? nextCollection.assets[key].sourceRef : asset.sourceRef,
      manifestSha256: hashBytes(manifestBytes), sourceSha256: hashBytes(sourceBytes), canonicalSha256: hashBytes(canonical),
      canonicalFile: posix(relative(work, join(target, 'asset.glb'))), runtimeSha256: hashBytes(runtime), sourceFile: runtimeFile, metadataFile,
      ...(materials ? { materialsSha256: hashBytes(materials) } : {}),
    };
    runtimeFiles.push(asset.slug);
  }
  if (bySlug.size) fail(`Swaps name no catalog asset: ${[...bySlug.keys()].join(', ')}`);
  for (const resource of catalog.textureResources ?? []) {
    const path = resource.editableDownload.path, bytes = get(path);
    await put(join(work, path), bytes);
    selection.materials[resource.slug] = path;
    selection.materialSeals[resource.slug] = { bytes: bytes.length, sha256: hashBytes(bytes) };
  }
  // The scene's built files in the order the published pack sealed them; a swapped model keeps its place.
  const sceneFiles = [];
  for (const { path } of pack.files.filter((f) => f.path.startsWith('web/'))) {
    let member = { path, bytes: get(path) };
    if (woodland.has(path)) member = woodland.get(path);
    if (path === 'web/woodland/collection.json' && swaps.length) member = { path, bytes: encode(nextCollection) };
    await put(join(scene, 'build', member.path), member.bytes);
    sceneFiles.push({ path: member.path, source: `build/${member.path}`, bytes: member.bytes.length, sha256: hashBytes(member.bytes) });
  }
  const selectionBytes = encode(selection);
  await put(join(work, 'production-selection.json'), selectionBytes);
  await put(join(scene, 'stage-manifest.json'), encode({ schemaVersion: 1, selectionSha256: hashBytes(selectionBytes), files: sceneFiles }));
  // The maintained source; its runtime pin names the release, the selection and the woodland files.
  const sourceSeal = reencodable(get('scene-source/source-manifest.json'), 'scene-source/source-manifest.json');
  let runtimePin = null;
  for (const entry of sourceSeal.files) {
    let bytes = get(`scene-source/${entry.path}`);
    if (entry.path === 'runtime-pin.json') {
      const pin = reencodable(bytes, 'scene-source/runtime-pin.json');
      const woodlandFiles = sceneFiles.filter((f) => f.path.startsWith('web/woodland/')).map(({ path, bytes: size, sha256 }) => ({ path, bytes: size, sha256 })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      bytes = encode({ ...pin, release, selectionSha256: hashBytes(selectionBytes), files: woodlandFiles });
      Object.assign(entry, { bytes: bytes.length, sha256: hashBytes(bytes) });
      runtimePin = bytes;
    }
    await put(join(source, entry.path), bytes);
  }
  await put(join(source, 'source-manifest.json'), encode(sourceSeal));
  return { workspace, scene, source, selection: join(work, 'production-selection.json'), selectionSha256: hashBytes(selectionBytes), runtimePin, collection: nextCollection, removed: [...removed] };
}

/** Members of two staged trees (path to bytes) that differ, appear or disappear. */
export function compareTrees(before, after) {
  const changed = [], added = [], removed = [];
  for (const [path, bytes] of after) {
    if (!before.has(path)) added.push(path);
    else if (!before.get(path).equals(bytes)) changed.push(path);
  }
  for (const path of before.keys()) if (!after.has(path)) removed.push(path);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort(), unchanged: [...after.keys()].filter((p) => before.has(p) && before.get(p).equals(after.get(p))).length };
}

export async function main(argv = process.argv.slice(2)) {
  const option = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const many = (flag) => argv.flatMap((value, i) => (argv[i - 1] === flag ? [resolve(value)] : []));
  const proof = argv.includes('--proof');
  const archivePath = resolve(option('--archive') ?? fail('--archive SITE.zip is required'));
  const work = resolve(option('--work') ?? fail('--work DIR is required'));
  const stores = many('--store');
  if (!stores.length) fail('--store DIR is required');
  const record = JSON.parse(await readFile(join(SITE, 'src/data/cabin-woods-site.json'), 'utf8'));
  const archive = await readFile(archivePath);
  if (hashBytes(archive) !== record.sha256 || archive.length !== record.bytes) fail(`${archivePath} is not the pinned ${record.release} archive`);
  const files = new Map(Object.entries(verifyArchive(archive).files).filter(([path]) => path !== 'delivery.json' && !path.endsWith('/')).map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const catalog = JSON.parse(await readFile(join(SITE, `src/data/${CABIN_ID}.json`), 'utf8'));
  let list = { release: record.release, swaps: [] };
  if (!proof) {
    const inputs = resolve(option('--inputs') ?? fail('--inputs DIR is required'));
    const raw = JSON.parse(await readFile(option('--swaps') ?? fail('--swaps LIST.json is required'), 'utf8'));
    if (raw.scene !== CABIN_ID || raw.from?.release !== record.release || raw.from?.archiveSha256 !== record.sha256) fail(`The swap list does not start from ${CABIN_ID}/${record.release} (${record.sha256})`);
    if (raw.release === record.release) fail(`Release ${raw.release} already exists; an immutable release id is never reused for changed bytes`);
    list = await parseSwapList(raw, { inputs });
    list.swaps = list.swaps.map((swap) => ({ ...swap, fileAbsolute: join(inputs, swap.file) }));
  }
  const rebuilt = await rebuildCabinInputs({ files, catalog, stores, swaps: list.swaps, release: list.release, work });
  const site = join(work, 'site');
  await mkdir(join(site, 'src/data'), { recursive: true });
  for (const name of [`${CABIN_ID}.json`, 'rig-posters.json']) await cp(join(SITE, 'src/data', name), join(site, 'src/data', name));
  const sourceRoot = option('--sources') ? resolve(option('--sources')) : join(work, 'packs');
  const { stageCabinWoods } = await import('./stage-cabin-woods.mjs');
  const staged = await stageCabinWoods({ workspace: rebuilt.workspace, scene: rebuilt.scene, source: rebuilt.source, selection: rebuilt.selection, site, sourceRoot, release: list.release, publication: catalog.available ? 'public' : 'preview', expectedAssets: catalog.assets.length });
  const out = join(site, 'public/asset-demos', CABIN_ID);
  const after = await readStandalone(out);
  const report = { release: list.release, previousRelease: record.release, selectionSha256: rebuilt.selectionSha256, members: after.size, ...compareTrees(files, after), swapped: list.swaps.map((s) => ({ member: s.member, previous: s.previous, next: { revision: s.revision, bytes: s.bytes.length, sha256: s.sha256 } })) };
  const mirror = option('--mirror');
  if (mirror) {
    const { packCabinSite } = await import('./stage-cabin-site.mjs');
    report.archive = await packCabinSite({ source: out, mirror: resolve(mirror), release: list.release });
  }
  report.catalog = join(site, 'src/data', `${CABIN_ID}.json`);
  report.runtimePin = join(rebuilt.source, 'runtime-pin.json');
  console.log(JSON.stringify(report, null, 2));
  return { report, staged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
