import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { unzipSync } from 'fflate';
import { assetPath, verifyArchive, verifyBytes } from './mirror-core.mjs';

/** Hydrate only the chosen pack; normal engine setup never downloads content. */
export async function hydrateAssetSources({ catalog, group, directory, mirror }) {
  const delivery = catalog.groups[group];
  if (!delivery) throw new Error(`Unknown delivery group: ${group}`);
  const pin = delivery.downloads.find(item => item.profile === 'editable');
  if (!pin) throw new Error(`${group}: editable download missing`);
  let bytes;
  if (mirror) bytes = await readFile(join(mirror, assetPath(pin.path)));
  else {
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Editable download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const archive = verifyArchive(verifyBytes(bytes, pin), 'delivery');
  if (archive.manifest.profile !== 'editable' || archive.manifest.group !== group) throw new Error('Editable archive identity mismatch');
  const records = [], pendingWrites = [];
  for (const [path, bundle] of Object.entries(archive.files)) {
    if (!path.startsWith('revisions/')) continue;
    const match = /^revisions\/([a-z][a-z0-9_-]*)\/([a-z][a-z0-9_-]*)\/([a-z][a-z0-9_-]*)\.zip$/.exec(path);
    if (!match) throw new Error(`Unsafe revision bundle: ${path}`);
    const [, collection, assetId, revisionId] = match;
    let decoded = 0;
    const members = unzipSync(bundle, { filter(entry) { decoded += entry.originalSize; if (decoded > 64 * 1024 * 1024) throw new Error('Revision exceeds import limit'); return true; } });
    const prefix = `${assetId}/${revisionId}/`;
    const manifest = JSON.parse(new TextDecoder().decode(members[prefix + 'manifest.json']));
    if (manifest.assetId !== assetId || manifest.revisionId !== revisionId) throw new Error('Revision bundle identity mismatch');
    const expected = new Set(['manifest.json', ...Object.keys(manifest.files), ...(members[prefix + 'materials.kiln.json'] ? ['materials.kiln.json'] : [])]);
    for (const [name, seal] of Object.entries(manifest.files)) verifyBytes(members[prefix + assetPath(name)], seal, path);
    for (const member of Object.keys(members)) if (!member.startsWith(prefix) || !expected.has(member.slice(prefix.length))) throw new Error(`Unsealed revision member ${member}`);
    const target = join(directory, 'assets', collection === 'project' ? 'kiln' : assetPath(collection), assetPath(assetId), 'revisions', assetPath(revisionId));
    pendingWrites.push({ target, members, prefix });
    records.push({ collection, assetId, revisionId });
  }
  const required = delivery.assets.flatMap(asset => asset.includedRevisions.map(revisionId => `${asset.collection}/${asset.assetId}/${revisionId}`));
  const actual = new Set(records.map(record => `${record.collection}/${record.assetId}/${record.revisionId}`));
  if (required.some(key => !actual.has(key)) || actual.size !== new Set(required).size) throw new Error('Included revision inventory mismatch');
  const writes = [];
  for (const { target, members, prefix } of pendingWrites) {
    for (const member of Object.keys(members)) {
      const destination = join(target, assetPath(member.slice(prefix.length)));
      try {
        const existing = await readFile(destination);
        const same = member.endsWith('.json')
          ? isDeepStrictEqual(JSON.parse(existing.toString()), JSON.parse(new TextDecoder().decode(members[member])))
          : existing.equals(Buffer.from(members[member]));
        if (!same) throw new Error(`Existing revision differs: ${destination}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        writes.push({ destination, bytes: members[member] });
      }
    }
  }
  for (const { destination, bytes } of writes) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
  }
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1];
  if (!args.includes('--group') || !args.includes('--output')) throw new Error('Usage: node scripts/hydrate-asset-sources.mjs --group ID --output DIR [--mirror DIR]');
  const catalog = JSON.parse(await readFile(new URL('../src/data/asset-delivery.json', import.meta.url), 'utf8'));
  const records = await hydrateAssetSources({ catalog, group: option('--group'), directory: option('--output'), ...(args.includes('--mirror') ? { mirror: option('--mirror') } : {}) });
  console.log(JSON.stringify({ group: option('--group'), hydratedRevisions: records.length }));
}
