import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildDeliveryArchive, deterministicZip, isSavedMaterialDependency, revisionBundle } from './asset-delivery.mjs';
import { assetPath, hashBytes, verifyBytes } from './mirror-core.mjs';

const ID = 'cabin-woods-psx-horror', BASE = `/asset-demos/${ID}/`;
const MAX_FILE = 64 * 1024 * 1024, MAX_TOTAL = 512 * 1024 * 1024;
const OLD_TITLE = /The Nightman Cometh/i;
const json = bytes => JSON.parse(bytes.toString('utf8'));
function safe(path) {
  assetPath(path);
  if (path.split('/').some(part => !part) || /(?:^|\/)(?:node_modules|\.git|\.env[^/]*|\.kiln|\.cache|\.runtime)(?:\/|$)/i.test(path)) throw new Error(`Unsafe staged path: ${path}`);
  return path;
}
function text(bytes, name) {
  if (OLD_TITLE.test(bytes.toString('utf8'))) throw new Error(`Private legacy title in ${name}`);
  return bytes;
}
function glb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.toString('ascii', 16, 20) !== 'JSON') throw new Error('Invalid canonical/runtime GLB');
  const length = bytes.readUInt32LE(12);
  if (length > 16 * 1024 * 1024 || length + 20 > bytes.length) throw new Error('Invalid GLB JSON budget');
  const document = json(text(bytes.subarray(20, 20 + length), 'GLB JSON'));
  return { document, binary: bytes.subarray(20 + length) };
}
function verifyRuntimeProfile(canonical, runtime, metadata, slug) {
  const authored = glb(canonical), delivered = glb(runtime);
  if (!authored.binary.equals(delivered.binary)) throw new Error('Runtime GLB binary differs from selected canonical');
  const provenance = delivered.document.asset?.extras?.kilnProvenanceV1;
  if (provenance?.version !== 'kiln.provenance.v1' || provenance.profile !== 'runtime' || provenance.metadata?.uri !== `${slug}.kiln-metadata.json` || provenance.metadata?.sha256 !== `sha256:${hashBytes(metadata)}`) throw new Error(`Runtime provenance sidecar URI/hash mismatch: ${slug}`);
  // Compare parsed data only; the admitted bytes and sealed files are never rewritten.
  for (const scene of authored.document.scenes ?? []) if (scene.extras && Object.hasOwn(scene.extras, 'kilnReviewClipsV1')) delete scene.extras.kilnReviewClipsV1;
  delete delivered.document.asset.extras.kilnProvenanceV1;
  if (!Object.hasOwn(authored.document.asset, 'extras') && !Object.keys(delivered.document.asset.extras).length) delete delivered.document.asset.extras;
  if (!isDeepStrictEqual(authored.document, delivered.document)) throw new Error(`Runtime GLB semantics differ from selected canonical: ${slug}`);
}
function metricsOf(bytes, manifest) {
  const { document: d } = glb(bytes), queue = [...(d.scenes?.[d.scene ?? 0]?.nodes ?? [])], seen = new Set(), materials = new Set();
  let triangles = 0, meshes = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  while (queue.length) {
    const index = queue.pop();
    if (seen.has(index) || seen.size >= 10000 || !d.nodes?.[index]) throw new Error('Invalid or excessive GLB node graph');
    seen.add(index); const node = d.nodes[index]; queue.push(...(node.children ?? []));
    if (node.mesh === undefined) continue;
    meshes++;
    for (const p of d.meshes[node.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) throw new Error('Unsupported non-triangle asset primitive');
      const count = d.accessors[p.indices ?? p.attributes.POSITION]?.count;
      if (!Number.isSafeInteger(count) || count % 3 || count < 3) throw new Error('Invalid triangle accessor');
      triangles += count / 3;
      if (p.material !== undefined) materials.add(p.material);
      const bounds = d.accessors[p.attributes.POSITION];
      if (bounds.min && bounds.max) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], bounds.min[i]); max[i] = Math.max(max[i], bounds.max[i]); }
    }
  }
  const integration = manifest.build?.integration;
  if (integration?.renderMetrics?.triangles !== undefined && triangles !== integration.renderMetrics.triangles) throw new Error('Canonical GLB triangles disagree with saved integration manifest');
  const bounds = integration?.bounds ?? { min, max, size: max.map((v, i) => v - min[i]) };
  if (![...bounds.min, ...bounds.max, ...bounds.size].every(Number.isFinite)) throw new Error('Missing finite saved bounds');
  return { triangles, meshes, materials: materials.size, bounds: bounds.size, boundsMin: bounds.min, boundsMax: bounds.max, clips: (d.animations ?? []).map(a => a.name ?? '(unnamed)'), extensions: [...(d.extensionsUsed ?? [])].sort() };
}
function imageOf(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.length < 24) throw new Error('Saved preview is not PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 16 * 1024 * 1024) throw new Error('Saved preview exceeds image budget');
  return { width, height };
}
function materialClosure(payload, roots) {
  if (![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.records) || payload.records.length > 1024) throw new Error('Invalid material payload');
  const records = new Map();
  for (const record of payload.records) {
    const m = record.manifest, key = `${m.materialId}/${m.revisionId}`;
    if (records.has(key)) throw new Error(`Duplicate material identity: ${key}`);
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(m.materialId) || !/^sha256:[a-f0-9]{64}$/.test(m.revisionId) || !Array.isArray(m.maps) || !m.maps.length || m.maps.length > 5) throw new Error('Invalid material manifest identity/maps');
    for (const map of m.maps) {
      safe(map.file); const encoded = record.files[map.file];
      if (typeof encoded !== 'string' || encoded.length > MAX_FILE * 4 / 3) throw new Error('Missing/excessive material encoded map');
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64') !== encoded) throw new Error('Noncanonical material base64');
      verifyBytes(bytes, map, key);
    }
    if (Object.keys(record.files).length !== m.maps.length) throw new Error('Unexpected material map file');
    records.set(key, record);
  }
  const seen = new Set(), active = new Set();
  function visit(m) {
    const key = `${m.materialId}/${m.revisionId}`, record = records.get(key);
    if (!record || !isDeepStrictEqual(record.manifest, m)) throw new Error(`Material closure differs or missing: ${key}`);
    if (active.has(key)) throw new Error('Material closure cycle');
    if (seen.has(key)) return;
    active.add(key);
    for (const pin of m.dependencies ?? []) {
      const child = records.get(`${pin.resourceId}/${pin.revisionId}`);
      if (!child || pin.sha256 !== pin.revisionId) throw new Error('Missing material dependency pin');
      visit(child.manifest);
    }
    active.delete(key); seen.add(key);
  }
  for (const m of roots ?? payload.records.map(r => r.manifest)) visit(m);
  if (seen.size !== records.size) throw new Error('Unreferenced material history in selected closure');
  return payload.records;
}

/** Manual, explicit local staging. All inputs are admitted/verified before any delivery write. */
export async function stageCabinWoods({ workspace, scene, source, selection = resolve(scene, 'production-selection.json'), site = resolve(import.meta.dirname, '..'), sourceRoot = resolve(site, '../packs'), release = 'review-01', publication = 'preview', expectedAssets = 53, sceneManifest = resolve(scene, 'stage-manifest.json') } = {}) {
  if (!workspace || !scene || !source || !/^[a-z0-9-]+$/.test(release)) throw new Error('Explicit workspace, scene, source and safe release are required');
  if (!['preview', 'public'].includes(publication)) throw new Error('Unknown publication mode');
  const published = publication === 'public';
  workspace = await realpath(workspace); scene = await realpath(scene); source = await realpath(source);
  let admitted = 0;
  async function read(file, root = workspace) {
    const resolved = await realpath(file);
    if (resolved !== root && !resolved.startsWith(root + sep)) throw new Error(`Input path escaped its explicit root: ${file}`);
    const size = (await stat(resolved)).size;
    if (size > MAX_FILE || admitted + size > MAX_TOTAL) throw new Error('Input byte budget exceeded');
    admitted += size; return readFile(resolved);
  }
  const selectionBytes = await read(selection), selected = json(text(selectionBytes, 'selection')), selectionRoot = dirname(resolve(selection));
  if (!selected.assets || Object.keys(selected.assets).length !== expectedAssets || expectedAssets > 128) throw new Error(`Expected ${expectedAssets} exact selected assets`);
  const buildSealBytes = await read(sceneManifest, scene), buildSeal = json(buildSealBytes);
  if (buildSeal.schemaVersion !== 1 || buildSeal.selectionSha256 !== hashBytes(selectionBytes)) throw new Error('Scene build selection seal mismatch');
  const sourceSealBytes = await read(resolve(source, 'source-manifest.json'), source), sourceSeal = json(sourceSealBytes);
  if (sourceSeal.schemaVersion !== 1 || !Array.isArray(sourceSeal.files) || sourceSeal.files.length > 2048 || !Array.isArray(buildSeal.files) || buildSeal.files.length > 4096) throw new Error('Invalid scene/source file seal inventory');
  const output = new Map(), lightweight = new Map(), assets = [], models = [], inventory = [], materialRecords = new Map();
  function add(path, bytes) { safe(path); if (output.has(path)) throw new Error(`Duplicate staged output: ${path}`); output.set(path, Buffer.from(bytes)); }
  function retain(path, bytes) { const prior = lightweight.get(path); if (prior && !prior.equals(bytes)) throw new Error(`Conflicting lightweight source record: ${path}`); lightweight.set(path, Buffer.from(bytes)); }
  const download = (path, bytes) => { add(path, bytes); return { path, url: BASE + path, bytes: bytes.length, sha256: hashBytes(bytes) }; };
  const runtimeMembers = {}, editableMembers = {}, sceneMembers = {}, textureResources = [];
  const licence = Buffer.from('SPDX-License-Identifier: CC0-1.0\nCandidate authored asset content follows the owner\'s CC0 policy, subject to final release approval. Scene and dependency software retain their own licences.\n');
  for (const entry of buildSeal.files) {
    safe(entry.path); safe(entry.source);
    if (!/^web\/(?:game\.html|review-poster(?:-(?:aerial|interior))?\.png|assets\/.+\.(?:js|css)|woodland\/.+\.(?:glb|png|json))$/.test(entry.path)) throw new Error(`Unexpected scene output: ${entry.path}`);
    const bytes = verifyBytes(await read(resolve(scene, entry.source), scene), entry, entry.path);
    if (/\.(?:html|js|css|json)$/.test(entry.path)) text(bytes, entry.path);
    add(entry.path, bytes); sceneMembers[entry.path] = bytes;
  }
  if (!output.has('web/game.html')) throw new Error('Scene entry is missing');
  const collectionBytes = output.get('web/woodland/collection.json');
  if (!collectionBytes) throw new Error('Scene runtime collection is missing');
  const sceneCollection = json(collectionBytes);
  if (sceneCollection.schemaVersion !== 1 || !sceneCollection.assets || Array.isArray(sceneCollection.assets) || Object.keys(sceneCollection.assets).length !== Object.keys(selected.assets).length) throw new Error('Scene runtime collection selection differs');
  for (const entry of sourceSeal.files) {
    safe(entry.path);
    if (!/^(?:(?:src|scripts|test|tests|shared)\/.+\.(?:mjs|js|jsx|ts|tsx|css|json|svg)|game\.html|vite\.config\.mjs|package\.json|bun\.lock|README\.md|LICENSE|THIRD-PARTY-NOTICES\.txt|\.gitignore|[a-z0-9-]+(?:manifest|pin|pins)\.json)$/.test(entry.path)) throw new Error(`Unexpected maintained source path: ${entry.path}`);
    const bytes = text(verifyBytes(await read(resolve(source, entry.path), source), entry, entry.path), entry.path);
    if (/\.(?:glb|png|zip|webp|jpg)$/i.test(entry.path)) throw new Error('Generated scene assets cannot masquerade as maintained source');
    const path = `scene-source/${entry.path}`; add(path, bytes); sceneMembers[path] = bytes;
  }
  const sourceRuntimePin = output.get('scene-source/runtime-pin.json');
  if (sourceRuntimePin) {
    const pin = json(sourceRuntimePin);
    if (pin.schemaVersion !== 1 || pin.release !== release || pin.selectionSha256 !== hashBytes(selectionBytes)) throw new Error('Source runtime pin differs from archive release or selected revisions');
  }
  for (const required of ['LICENSE', 'THIRD-PARTY-NOTICES.txt']) if (!output.has(`scene-source/${required}`)) throw new Error(`Missing scene software ${required}`);
  add('scene-source/source-manifest.json', sourceSealBytes); sceneMembers['scene-source/source-manifest.json'] = sourceSealBytes;
  const slugs = new Set(), identities = new Set();
  for (const [key, chosen] of Object.entries(selected.assets)) {
    const slug = key === 'nightman' ? 'stone-golem' : key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slugs.has(slug)) throw new Error('Invalid/duplicate gallery slug');
    slugs.add(slug);
    if (chosen.collection !== 'project' || !/^a_[a-f0-9]{32}$/.test(chosen.assetId) || !/^r_[a-f0-9]{32}$/.test(chosen.revisionId)) throw new Error('Invalid selected collection/revision identity');
    const identity = `${chosen.collection}/${chosen.assetId}/${chosen.revisionId}`;
    if (identities.has(identity)) throw new Error('Duplicate selected asset identity'); identities.add(identity);
    const revision = resolve(workspace, 'assets/kiln', chosen.assetId, 'revisions', chosen.revisionId);
    const manifestBytes = text(await read(resolve(revision, 'manifest.json')), identity);
    if (typeof chosen.manifestSha256 !== 'string') throw new Error(`Missing frozen saved manifest hash: ${slug}`);
    verifyBytes(manifestBytes, { bytes: manifestBytes.length, sha256: chosen.manifestSha256 }, `${slug} saved manifest`);
    const manifest = json(manifestBytes);
    if (manifest.assetId !== chosen.assetId || manifest.revisionId !== chosen.revisionId || !manifest.editable) throw new Error('Saved selected revision identity/editability mismatch');
    const files = {};
    for (const [name, seal] of Object.entries(manifest.files)) { safe(name); files[name] = verifyBytes(await read(resolve(revision, name)), seal, `${identity}/${name}`); }
    for (const name of ['asset.glb', 'source.kiln.js', 'preview.png']) if (!files[name]) throw new Error(`Full Kiln revision lacks ${name}`);
    text(files['source.kiln.js'], identity);
    if (typeof chosen.sourceSha256 !== 'string') throw new Error(`Missing frozen source hash: ${slug}`);
    verifyBytes(files['source.kiln.js'], { bytes: files['source.kiln.js'].length, sha256: chosen.sourceSha256 }, `${slug} frozen source`);
    const canonical = files['asset.glb']; verifyBytes(canonical, { bytes: canonical.length, sha256: chosen.canonicalSha256 }, slug);
    if (!(await read(resolve(selectionRoot, chosen.canonicalFile))).equals(canonical)) throw new Error('Selection canonical file differs from saved revision');
    if (typeof chosen.runtimeSha256 !== 'string' || !/^(?:sha256:)?[a-f0-9]{64}$/.test(chosen.runtimeSha256)) throw new Error(`Missing final runtime hash: ${slug}`);
    const runtime = await read(resolve(selectionRoot, chosen.sourceFile)); verifyBytes(runtime, { bytes: runtime.length, sha256: chosen.runtimeSha256 }, `${slug} runtime`);
    const metadata = await read(resolve(selectionRoot, chosen.metadataFile ?? chosen.sourceFile.replace(/\.glb$/i, '.kiln-metadata.json'))), meta = json(text(metadata, slug));
    verifyRuntimeProfile(canonical, runtime, metadata, slug);
    if (meta.source?.assetId !== manifest.assetId || meta.source?.revisionId !== manifest.revisionId || meta.source?.glbSha256?.replace(/^sha256:/, '') !== hashBytes(canonical) || meta.source?.sourceSha256?.replace(/^sha256:/, '') !== hashBytes(files['source.kiln.js'])) throw new Error('Runtime sidecar source identity/hash mismatch');
    const sceneAsset = sceneCollection.assets[key];
    if (!sceneAsset || sceneAsset.collection !== chosen.collection || sceneAsset.assetId !== manifest.assetId || sceneAsset.revisionId !== manifest.revisionId || sceneAsset.canonicalSha256 !== hashBytes(canonical) || sceneAsset.runtimeSha256 !== hashBytes(runtime) || sceneAsset.sha256 !== hashBytes(runtime) || sceneAsset.bytes !== runtime.length || sceneAsset.metadataSha256 !== hashBytes(metadata) || sceneAsset.metadataBytes !== metadata.length || !/^\.\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/.test(sceneAsset.url) || sceneAsset.metadataURL !== `./assets/${slug}.kiln-metadata.json`) throw new Error(`Scene runtime model/metadata identity/hash pair differs: ${slug}`);
    const sceneModel = output.get(`web/woodland/${sceneAsset.url.slice(2)}`), sceneMetadata = output.get(`web/woodland/${sceneAsset.metadataURL.slice(2)}`);
    if (!sceneModel?.equals(runtime) || !sceneMetadata?.equals(metadata)) throw new Error(`Scene runtime selected model/metadata bytes are missing or differ: ${slug}`);
    const dependencies = (manifest.build?.dependencies ?? []).filter(isSavedMaterialDependency);
    const record = { manifest, files };
    if (dependencies.length) {
      const bytes = text(await read(resolve(revision, 'materials.kiln.json')), 'material closure');
      if (typeof chosen.materialsSha256 !== 'string') throw new Error(`Missing frozen material closure hash: ${slug}`);
      verifyBytes(bytes, { bytes: bytes.length, sha256: chosen.materialsSha256 }, `${slug} full material closure`);
      record.materialResources = json(bytes);
      for (const material of materialClosure(record.materialResources, dependencies.map(d => d.manifest))) {
        const mkey = `${material.manifest.materialId}/${material.manifest.revisionId}`;
        if (materialRecords.has(mkey) && !isDeepStrictEqual(materialRecords.get(mkey), material)) throw new Error(`Conflicting material identity ${mkey}`);
        materialRecords.set(mkey, material);
      }
    }
    const editable = revisionBundle(record), metric = metricsOf(canonical, manifest), dimensions = imageOf(files['preview.png']);
    const entry = { slug, collection: chosen.collection, assetId: manifest.assetId, revisionId: manifest.revisionId, ...(manifest.parentRevision ? { parentRevision: manifest.parentRevision } : {}), includedRevisions: [manifest.revisionId], historyScope: 'selected-only', sourceSha256: hashBytes(files['source.kiln.js']) }; inventory.push(entry);
    const runtimeModelDownload = download(`models/${slug}.glb`, runtime), metadataDownload = download(`models/${slug}.kiln-metadata.json`, metadata), canonicalDownload = download(`canonical/${slug}.glb`, canonical), manifestDownload = download(`metadata/${slug}/manifest.json`, manifestBytes);
    const sourcePath = `source/${identity}/source.kiln.js`; add(sourcePath, files['source.kiln.js']);
    const posterPath = `posters/${slug}.png`; add(posterPath, files['preview.png']);
    const editableDownload = download(`downloads/editable/${slug}.zip`, editable);
    const runtimeDownload = download(`downloads/runtime/${slug}.zip`, buildDeliveryArchive({ profile: 'runtime', group: ID, assets: [entry], files: { [`models/${slug}.glb`]: runtime, [`models/${slug}.kiln-metadata.json`]: metadata, 'LICENSE.txt': licence } }));
    runtimeMembers[`models/${slug}.glb`] = runtime; runtimeMembers[`models/${slug}.kiln-metadata.json`] = metadata;
    editableMembers[`revisions/${identity}.zip`] = editable;
    retain(`sources/${identity}/source.kiln.js`, files['source.kiln.js']); retain(`sources/${identity}/manifest.json`, manifestBytes);
    models.push({ id: key, path: runtimeModelDownload.path, collection: chosen.collection, assetId: manifest.assetId, revisionId: manifest.revisionId });
    const fidelity = manifest.preview?.fidelity ?? null;
    if (fidelity?.materialFaithful && fidelity.inputGlbSha256?.replace(/^sha256:/, '') !== hashBytes(canonical)) throw new Error('Saved material-faithful preview names another GLB');
    assets.push({ slug, name: chosen.name, description: (chosen.description ?? `${chosen.name}, an original Kiln asset.`).replace(/\s*Owner visual review pending\./g, ''), category: chosen.category ?? 'Cabin and woodland', pack: ID, collection: chosen.collection, assetId: manifest.assetId, revisionId: manifest.revisionId, sourceRef: chosen.sourceRef, modelPath: runtimeModelDownload.url, sourcePath: BASE + sourcePath, sourceSha256: entry.sourceSha256, manifestDownload, canonicalDownload, runtimeModelDownload, metadataDownload, runtimeDownload, editableDownload, poster: { src: BASE + posterPath, ...dimensions, alt: `${chosen.name}: exact saved revision preview`, srcsetAvif: '', srcsetWebp: '', fidelity }, metrics: metric, review: { ownerAccepted: published, status: published ? 'accepted' : 'awaiting-owner-review' }, historyScope: 'selected-only' });
  }
  for (const [name, path] of Object.entries(selected.materials ?? {})) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid standalone material slug');
    const bytes = text(await read(resolve(selectionRoot, path)), `material ${name}`);
    const seal = selected.materialSeals?.[name];
    if (!seal || typeof seal.sha256 !== 'string') throw new Error(`Missing frozen standalone material seal: ${name}`);
    verifyBytes(bytes, { bytes: seal.bytes ?? bytes.length, sha256: seal.sha256 }, `${name} standalone material`);
    const payload = json(bytes);
    for (const record of materialClosure(payload)) {
      const key = `${record.manifest.materialId}/${record.manifest.revisionId}`;
      if (materialRecords.has(key) && !isDeepStrictEqual(materialRecords.get(key), record)) throw new Error(`Conflicting standalone material ${key}`);
      materialRecords.set(key, record);
    }
    const portable = download(`materials/${name}.kiln.json`, bytes); editableMembers[`materials/${name}.kiln.json`] = bytes;
    textureResources.push({ slug: name, label: name.charAt(0).toUpperCase() + name.slice(1), editableDownload: portable, records: payload.records.map(r => ({ materialId: r.manifest.materialId, revisionId: r.manifest.revisionId })) });
  }
  for (const [key, record] of materialRecords) {
    const prefix = `materials/${key.replace('/sha256:', '/')}`, bytes = Buffer.from(JSON.stringify(record.manifest, null, 2) + '\n');
    retain(`${prefix}/manifest.json`, bytes); add(`${prefix}/manifest.json`, bytes); runtimeMembers[`${prefix}/manifest.json`] = bytes;
    for (const map of record.manifest.maps) { const bytes = Buffer.from(record.files[map.file], 'base64'); add(`${prefix}/${safe(map.file)}`, bytes); runtimeMembers[`${prefix}/${map.file}`] = bytes; }
  }
  runtimeMembers['LICENSE.txt'] = licence; editableMembers['LICENSE.txt'] = licence;
  editableMembers['README.txt'] = Buffer.from('Full Kiln assets (remixable)\n\nEach ZIP under revisions/ is a standard Kiln asset bundle with the full model, exact source, editing manifest, preview and complete saved material resources. Import the selected ZIP into Kiln Library or use node kiln.mjs import revision.zip. This initial pack deliberately distributes selected revisions only; parent identifiers are retained without distributing earlier private authoring history. Standalone texture resources under materials/ import with kiln material import.\n');
  const downloads = [
    { profile: 'runtime', label: 'Runtime assets', ...download(`downloads/${ID}-runtime.zip`, buildDeliveryArchive({ profile: 'runtime', group: ID, files: runtimeMembers, assets: inventory })) },
    { profile: 'editable', label: 'Full Kiln assets (remixable)', ...download(`downloads/${ID}-editable.zip`, buildDeliveryArchive({ profile: 'editable', group: ID, files: editableMembers, assets: inventory })) },
  ];
  const serve = Buffer.from("import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,sep} from 'node:path';import {fileURLToPath} from 'node:url';const root=resolve(fileURLToPath(new URL('./web/',import.meta.url)));const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const f=resolve(root,'.'+(path==='/'?'/game.html':path));if(!f.startsWith(root+sep))throw Error('path');const data=await readFile(f);const ext=f.slice(f.lastIndexOf('.'));res.writeHead(200,{'content-type':mime[ext]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('Open http://127.0.0.1:4173/'));");
  sceneMembers['serve.mjs'] = serve; sceneMembers['licenses/ASSET-LICENSE.txt'] = licence;
  sceneMembers['LICENSE'] = output.get('scene-source/LICENSE');
  sceneMembers['THIRD-PARTY-NOTICES.txt'] = output.get('scene-source/THIRD-PARTY-NOTICES.txt');
  sceneMembers['README.txt'] = Buffer.from('Cabin in the Woods: PSX Horror\nRun node serve.mjs, then open http://127.0.0.1:4173/ in a desktop WebGPU browser. Mobile play is not qualified.\nBuilt runtime is under web/. Maintained source and its pinned build/hydrate instructions are under scene-source/. No node_modules or credentials are included. Asset content and software retain separate supplied licences/notices.\n');
  const sceneFiles = Object.fromEntries(Object.entries(sceneMembers).map(([path, bytes]) => [path, { bytes: bytes.length, sha256: hashBytes(bytes) }]));
  sceneMembers['delivery.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1, group: ID, profile: 'scene', release, sourceManifestSha256: hashBytes(sourceSealBytes), selectionSha256: hashBytes(selectionBytes), files: sceneFiles }, null, 2) + '\n');
  downloads.push({ profile: 'scene', label: 'Runnable scene and source', ...download(`downloads/${ID}-scene.zip`, deterministicZip(sceneMembers)) });
  add('licenses/ASSET-LICENSE.txt', licence); add('THIRD-PARTY-NOTICES.txt', output.get('scene-source/THIRD-PARTY-NOTICES.txt'));
  const allBytes = [...output.values()].reduce((n, b) => n + b.length, 0);
  if (allBytes > MAX_TOTAL) throw new Error('Staged output byte budget exceeded');
  const catalogPath = resolve(site, 'src/data', `${ID}.json`), existing = json(await readFile(catalogPath));
  for (const poster of existing.posters ?? []) {
    if (typeof poster.src !== 'string' || !poster.src.startsWith(BASE)) throw new Error('Scene poster is not a local staged path');
    const bytes = output.get(safe(poster.src.slice(BASE.length)));
    if (!bytes) throw new Error('Scene poster is not sealed by the scene build');
    const actual = imageOf(bytes);
    if (actual.width !== poster.width || actual.height !== poster.height) throw new Error('Scene poster dimensions differ from sealed PNG');
  }
  const catalog = { ...existing, id: ID, name: 'Cabin in the Woods: PSX Horror', base: BASE, release, available: published, status: published ? 'Available' : 'Owner review pending', assetCount: assets.length, assets, textureResources, downloads, runtime: { file: 'web/game.html', sha256: hashBytes(output.get('web/game.html')) } };
  const pack = { schemaVersion: 1, id: ID, name: catalog.name, release, available: published, status: catalog.status, models, files: [...output].map(([path, b]) => ({ path, bytes: b.length, sha256: hashBytes(b) })), source: { selectionSha256: hashBytes(selectionBytes), sourceManifestSha256: hashBytes(sourceSealBytes), historyScope: 'selected-only', assets: inventory } };
  // Existing lightweight records are immutable. Detect conflicts before writing any delivery.
  for (const [path, bytes] of lightweight) { try { const prior = await readFile(resolve(sourceRoot, ID, safe(path))); if (!prior.equals(bytes)) throw new Error(`Existing source record conflict: ${path}`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  const targetRoot = resolve(site, 'public', BASE.slice(1));
  try {
    if ((await lstat(targetRoot)).isSymbolicLink()) throw new Error('Staged root cannot be a symlink');
    const priorPack = json(await readFile(resolve(targetRoot, 'pack.json'))), priorSeals = new Map((priorPack.files ?? []).map(f => [safe(f.path), f]));
    let scanned = 0;
    async function guard(directory, prefix = '', depth = 0) {
      if (depth > 16) throw new Error('Existing staging depth budget exceeded');
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (++scanned > 10000 || file.isSymbolicLink()) throw new Error('Unsafe/excessive existing staged tree');
        const path = safe(prefix + file.name);
        if (file.isDirectory()) { await guard(resolve(directory, file.name), path + '/', depth + 1); continue; }
        if (path === 'pack.json') continue;
        if (!priorSeals.has(path)) throw new Error(`Unsealed existing staged file: ${path}`);
        if (!output.has(path)) throw new Error(`Prior staged file is absent from this candidate; archive the previous managed staging first: ${path}`);
        verifyBytes(await read(resolve(directory, file.name), targetRoot), priorSeals.get(path), path);
      }
    }
    await guard(targetRoot);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // An existing directory without pack.json is not an empty/fresh managed staging.
    try { if ((await readdir(targetRoot)).length) throw new Error('Unsealed existing staged tree lacks pack.json'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
  }
  for (const [path, bytes] of output) { const target = resolve(site, 'public', BASE.slice(1), safe(path)); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  for (const [path, bytes] of lightweight) { const target = resolve(sourceRoot, ID, safe(path)); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  await writeFile(resolve(site, 'public', BASE.slice(1), 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  return catalog;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), known = new Set(['--workspace', '--scene', '--source', '--selection', '--release', '--site', '--scene-manifest', '--publication']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) { if (!known.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: --workspace AUTHOR --scene REVIEW --source SOURCE --selection FINAL [--release ID] [--publication preview|public] [--site SITE] [--scene-manifest FILE]'); const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()); if (options[key]) throw new Error('Duplicate CLI option'); options[key] = args[i + 1]; }
  if (!options.workspace || !options.scene || !options.source || !options.selection) throw new Error('Explicit workspace/scene/source/selection required');
  const result = await stageCabinWoods(options);
  console.log(JSON.stringify({ id: result.id, assetCount: result.assetCount, available: result.available, runtime: result.runtime, downloads: result.downloads }, null, 2));
}
