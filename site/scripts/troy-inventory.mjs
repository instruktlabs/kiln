import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const safeId = /^[a-zA-Z0-9_-]+$/;
function bySlug(rows) {
  const result = new Map();
  for (const row of rows) {
    if (!safeId.test(row.slug) || result.has(row.slug)) throw new Error('Unsafe or duplicate inventory slug');
    result.set(row.slug, row);
  }
  return result;
}

/** Align lightweight source inventory with selected delivery and scene catalog records. */
export function alignTroyInventory({ inventory, catalog, group, manifests }) {
  const previous = bySlug(inventory.assets), selected = bySlug(group.assets), published = bySlug(catalog.assets);
  if (previous.size !== selected.size || selected.size !== published.size || [...selected.keys()].some(slug => !previous.has(slug) || !published.has(slug))) throw new Error('Troy inventory asset sets differ');
  const assets = inventory.assets.map(old => {
    const pin = selected.get(old.slug), asset = published.get(old.slug), manifest = manifests.get(old.slug);
    if (!manifest || ![pin.collection, pin.assetId, pin.revisionId].every(value => safeId.test(value)) || [asset, manifest].some(record => record.assetId !== pin.assetId || record.revisionId !== pin.revisionId)) throw new Error(`${old.slug}: canonical identity differs`);
    const seal = manifest.files?.['asset.glb'], runtime = pin.runtimeDownload;
    if (!seal || seal.bytes !== runtime.bytes || seal.sha256.replace(/^sha256:/, '') !== runtime.sha256 || asset.runtimeDownload.bytes !== runtime.bytes || asset.runtimeDownload.sha256 !== runtime.sha256) throw new Error(`${old.slug}: GLB pin differs`);
    if (new URL(runtime.url).origin !== 'https://assets.kilnstudio.tools' || new URL(pin.editableDownload.url).origin !== 'https://assets.kilnstudio.tools') throw new Error(`${old.slug}: delivery must use public R2 assets`);
    if (pin.includedRevisions[0] !== pin.revisionId) throw new Error(`${old.slug}: selected revision absent from history`);
    const source = `sources/${pin.collection}/${pin.assetId}/${pin.revisionId}`;
    const { parentRevision: _oldParent, ...preserved } = old;
    return {
      ...preserved, name: manifest.name, collection: pin.collection, assetId: pin.assetId, revisionId: pin.revisionId,
      ...(manifest.parentRevision ? { parentRevision: manifest.parentRevision } : {}),
      createdAt: manifest.createdAt, tags: manifest.tags, description: manifest.description,
      category: asset.category, metrics: asset.metrics, source: `${source}/source.kiln.js`, manifest: `${source}/manifest.json`,
      includedRevisions: [...pin.includedRevisions], missingParents: [...pin.missingParents],
      glb: runtime.url, glbBytes: runtime.bytes, glbSha256: runtime.sha256,
      editableDownload: { ...pin.editableDownload }, poster: new URL(asset.poster.src, 'https://kilnstudio.tools').href,
    };
  });
  return { ...inventory, sourceRoot: 'sources', sceneRelease: catalog.release, assets };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const repo = resolve(import.meta.dirname, '../..');
  const json = async path => JSON.parse(await readFile(resolve(repo, path), 'utf8'));
  const inventory = await json('packs/troy/inventory.json'), catalog = await json('site/src/data/troy.json');
  const group = (await json('site/src/data/asset-delivery.json')).groups.troy;
  const manifests = new Map();
  for (const pin of group.assets) {
    if (![pin.collection, pin.assetId, pin.revisionId].every(value => safeId.test(value))) throw new Error('Unsafe canonical source path');
    manifests.set(pin.slug, await json(`packs/troy/sources/${pin.collection}/${pin.assetId}/${pin.revisionId}/manifest.json`));
  }
  const aligned = alignTroyInventory({ inventory, catalog, group, manifests });
  await writeFile(resolve(repo, 'packs/troy/inventory.json'), JSON.stringify(aligned, null, 2) + '\n');
  console.log(`Aligned ${aligned.assets.length} Troy asset records to ${catalog.release}`);
}
