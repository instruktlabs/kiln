import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildDeliveryArchive, collectHistory, revisionBundle } from './asset-delivery.mjs';
import { ASSET_BASE, assetPath, hashBytes, verifyBytes } from './mirror-core.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function retainManifest(path, manifest) {
  try {
    if (!isDeepStrictEqual(await json(path), manifest)) throw new Error(`Saved manifest identity conflict: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
  }
}

/** Only canonical revision records are read; browsers, credentials and caches are excluded. */
export async function discoverRecords(roots) {
  const assets = new Map(), materials = new Map();
  for (const root of roots) {
    const paths = execFileSync('rg', ['--files', '--hidden', root, '-g', 'manifest.json', '-g', '!**/node_modules/**', '-g', '!**/.git/**'], { maxBuffer: 32 * 1024 * 1024 }).toString().split(/\r?\n/);
    for (const path of paths) {
      const normalized = path.replaceAll('\\', '/');
      if (!normalized.includes('/revisions/') && !normalized.includes('/materials/')) continue;
      let manifest;
      try { manifest = await json(path); } catch { continue; }
      if (manifest.version === 'kiln.asset.v1') {
        const directoryName = /\/assets\/([^/]+)\//.exec(normalized)?.[1];
        if (!directoryName) continue;
        // The maintained workspace host maps logical collection 'project' to assets/kiln.
        const collection = directoryName === 'kiln' ? 'project' : directoryName;
        const key = `${collection}/${manifest.assetId}/${manifest.revisionId}`;
        const candidates = assets.get(key) ?? [];
        candidates.push({ dir: dirname(path), manifest, collection });
        assets.set(key, candidates);
      } else if (manifest.materialId && manifest.revisionId && manifest.maps) {
        const key = `${manifest.materialId}/${manifest.revisionId}`;
        const candidates = materials.get(key) ?? [];
        candidates.push({ dir: dirname(path), manifest });
        materials.set(key, candidates);
      }
    }
  }
  return { assets, materials };
}

async function loadMaterial(dependency, index) {
  const manifest = dependency.manifest;
  const key = `${manifest.materialId}/${manifest.revisionId}`;
  for (const candidate of index.get(key) ?? []) {
    if (!isDeepStrictEqual(candidate.manifest, manifest)) continue;
    try {
      const files = {};
      for (const map of manifest.maps) files[map.file] = verifyBytes(await readFile(join(candidate.dir, assetPath(map.file))), map, key).toString('base64');
      return { manifest, files };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Saved material files unavailable: ${key}`);
}

export async function readSavedRevision(pin, index) {
  const candidates = index.assets.get(`${pin.collection}/${pin.assetId}/${pin.revisionId}`) ?? [];
  for (const candidate of candidates) {
    try {
      const files = {};
      for (const [name, seal] of Object.entries(candidate.manifest.files)) files[name] = verifyBytes(await readFile(join(candidate.dir, assetPath(name))), seal, `${pin.assetId}/${pin.revisionId}/${name}`);
      const dependencies = (candidate.manifest.build?.dependencies ?? []).filter(item => item?.kind === 'kiln.material.v1');
      const record = { manifest: candidate.manifest, files };
      if (dependencies.length) {
        try { record.materialResources = await json(join(candidate.dir, 'materials.kiln.json')); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          record.materialResources = { schemaVersion: 1, records: await Promise.all(dependencies.map(item => loadMaterial(item, index.materials))) };
        }
      }
      return record;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return undefined;
}

export async function deliveryGroups(site = SITE) {
  const groups = [];
  for (const group of ['farm', 'vehicles', 'foundry-floor']) {
    const catalog = await json(join(site, `src/data/packs/${group}.json`));
    groups.push({ id: group, assets: catalog.assets.map(asset => ({ ...asset,
      assetId: asset.assetId ?? asset.attribution?.asset ?? asset.source?.asset, revisionId: asset.revisionId ?? asset.source?.revision })) });
  }
  const bridge = await json(join(site, 'src/data/standalone/golden-gate-bridge.json'));
  groups.push({ id: 'golden-gate-bridge', standalone: true, assets: bridge.tiers.map(tier => ({
    slug: tier.tier === 'full' ? bridge.slug : `${bridge.slug}-${tier.tier}`, assetId: bridge.assetId, revisionId: tier.revisionId,
    runtimeDownload: tier.runtime,
    tier: tier.tier })) });
  groups.push({ id: 'troy', assets: (await json(join(site, 'src/data/troy.json'))).assets });
  return groups;
}

/** Existing runtime links stay byte-for-byte unchanged; new archives are deterministic and sealed. */
export async function stageAssetDelivery({ roots, mirror, runtimeRoots = [], fetchRuntime = false, output = join(SITE, 'src/data/asset-delivery.json'), sourceRoot = resolve(SITE, '../packs'), release = 'delivery-20261005-01', index, groups }) {
  assetPath(release);
  index ??= await discoverRecords(roots);
  groups ??= await deliveryGroups();
  const result = { schemaVersion: 1, release, groups: {} }, uploads = [];
  const writeDelivery = async (path, bytes) => {
    const target = join(mirror, assetPath(path));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const download = { path, bytes: bytes.length, sha256: hashBytes(bytes), url: new URL(path, ASSET_BASE).href };
    uploads.push(download);
    return download;
  };
  for (const group of groups) {
    const assets = [], editableMembers = {}, runtimeMembers = {}, identities = new Set();
    const slugs = new Set();
    for (const asset of group.assets) {
      if (slugs.has(asset.slug)) throw new Error(`Duplicate download slug: ${group.id}/${asset.slug}`);
      slugs.add(asset.slug);
    }
    for (const asset of group.assets) {
      const collections = [...new Set([...index.assets.values()].flat().filter(record => record.manifest.assetId === asset.assetId && record.manifest.revisionId === asset.revisionId).map(record => record.collection))];
      if (collections.length !== 1) throw new Error(`${asset.slug}: ambiguous or unavailable source collection (${collections.join(', ')})`);
      const pin = { collection: collections[0], assetId: asset.assetId, revisionId: asset.revisionId };
      const identity = `${pin.collection}/${pin.assetId}/${pin.revisionId}`;
      if (identities.has(identity)) throw new Error(`Duplicate asset identity: ${identity}`);
      identities.add(identity);
      const history = await collectHistory(pin, child => readSavedRevision(child, index));
      if (!history.records.every(record => record.manifest.editable)) throw new Error(`${asset.slug}: non-editable revision in source history`);
      const memberFiles = {};
      for (const record of history.records) {
        const prefix = `revisions/${pin.collection}/${pin.assetId}/${record.manifest.revisionId}`;
        memberFiles[`${prefix}.zip`] = revisionBundle(record);
        const sourceDir = join(sourceRoot, group.id, 'sources', pin.collection, pin.assetId, record.manifest.revisionId);
        await mkdir(sourceDir, { recursive: true });
        await retainManifest(join(sourceDir, 'manifest.json'), record.manifest);
        await writeFile(join(sourceDir, 'source.kiln.js'), record.files['source.kiln.js']);
        for (const material of record.materialResources?.records ?? []) {
          const materialDir = join(sourceRoot, group.id, 'materials', material.manifest.materialId, material.manifest.revisionId.replace(/^sha256:/, ''));
          await mkdir(materialDir, { recursive: true });
          await retainManifest(join(materialDir, 'manifest.json'), material.manifest);
        }
      }
      const entry = { slug: asset.slug, ...pin, includedRevisions: history.records.map(record => record.manifest.revisionId), missingParents: history.missingParents };
      memberFiles['README.txt'] = Buffer.from(`Editable assets\n\nSelected revision: ${identity}\nImport the ZIP for this revision in Kiln's Library. Other ZIPs contain included older revisions.\nEach revision ZIP contains its source, model, editing metadata and required saved materials.\nIncluded revisions: ${entry.includedRevisions.join(', ')}\nUnavailable parent records: ${entry.missingParents.join(', ') || 'none'}\nSoftware retains its own license. Authored content license: CC0-1.0.\n`);
      const editable = buildDeliveryArchive({ profile: 'editable', group: group.id, files: memberFiles, assets: [entry] });
      entry.editableDownload = await writeDelivery(`packs/${group.id}/${release}/editable/${asset.slug}.zip`, editable);
      for (const [path, bytes] of Object.entries(memberFiles)) {
        if (path === 'README.txt') continue;
        if (editableMembers[path] && !editableMembers[path].equals(bytes)) throw new Error(`Conflicting shared revision ${path}`);
        editableMembers[path] = bytes;
      }
      entry.runtimeDownload = asset.runtimeDownload;
      if (!entry.runtimeDownload) throw new Error(`${asset.slug}: runtime pin missing`);
      const runtimeUrl = new URL(entry.runtimeDownload.url, 'https://kilnstudio.tools/');
      const runtimePath = entry.runtimeDownload.path ?? runtimeUrl.pathname.replace(/^\//, '');
      let runtimeBytes;
      for (const runtimeRoot of [mirror, ...runtimeRoots, join(SITE, 'public'), join(SITE, 'dist')]) {
        try { runtimeBytes = verifyBytes(await readFile(join(runtimeRoot, assetPath(runtimePath))), entry.runtimeDownload); break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (!runtimeBytes && fetchRuntime) {
        const response = await fetch(runtimeUrl, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`${asset.slug}: runtime download HTTP ${response.status}`);
        runtimeBytes = verifyBytes(Buffer.from(await response.arrayBuffer()), entry.runtimeDownload);
      }
      if (!runtimeBytes) throw new Error(`${asset.slug}: runtime bytes unavailable in supplied mirror`);
      if (group.id === 'troy') entry.runtimeDownload = await writeDelivery(`packs/${group.id}/${release}/models/${asset.slug}.glb`, runtimeBytes);
      runtimeMembers[`models/${asset.slug}.glb`] = runtimeBytes;
      assets.push(entry);
    }
    const inventory = assets.map(({ slug, collection, assetId, revisionId, includedRevisions, missingParents }) => ({ slug, collection, assetId, revisionId, includedRevisions, missingParents }));
    editableMembers['README.txt'] = Buffer.from('Editable assets\n\nImport selected or older revision ZIPs from revisions/ into Kiln Library. delivery.json lists the selected revisions, included history and unavailable parents. Each ZIP includes its required material maps. Authored content: CC0-1.0. Software retains its own license.\n');
    runtimeMembers['LICENSE.txt'] = Buffer.from('SPDX-License-Identifier: CC0-1.0\nAuthored asset content is CC0-1.0 to the extent of the owner\'s rights. Kiln and other software retain their own licenses.\n');
    const downloads = [];
    for (const [profile, files] of [['runtime', runtimeMembers], ['editable', editableMembers]]) downloads.push({ profile, ...await writeDelivery(`packs/${group.id}/${release}/${group.id}-${profile}.zip`, buildDeliveryArchive({ profile, group: group.id, files, assets: inventory })) });
    result.groups[group.id] = { standalone: Boolean(group.standalone), downloads, assets };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(mirror, `asset-delivery-${release}-uploads.json`), JSON.stringify(uploads, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  if (!args.includes('--mirror') || !args.includes('--commons') || !args.includes('--troy')) throw new Error('Usage: node scripts/stage-asset-delivery.mjs --mirror DIR --commons DIR --troy DIR [--release ID]');
  const result = await stageAssetDelivery({ roots: [option('--commons'), option('--troy')], mirror: option('--mirror'), runtimeRoots: args.includes('--runtime-mirror') ? [option('--runtime-mirror')] : [], fetchRuntime: args.includes('--fetch-runtime'), ...(args.includes('--release') ? { release: option('--release') } : {}) });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result.groups).map(([id, value]) => [id, { assets: value.assets.length, downloads: value.downloads }]))));
}
