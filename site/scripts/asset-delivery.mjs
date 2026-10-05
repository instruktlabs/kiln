import { zipSync } from 'fflate';
import { assetPath, hashBytes, verifyBytes } from './mirror-core.mjs';

/** A history follows saved parents, never inventing records from the parent's identifier. */
export async function collectHistory(pin, read) {
  const records = [], missingParents = [], seen = new Set();
  let revisionId = pin.revisionId;
  while (revisionId) {
    if (seen.has(revisionId)) throw new Error(`Revision cycle: ${revisionId}`);
    seen.add(revisionId);
    const record = await read({ ...pin, revisionId });
    if (!record) {
      if (!records.length) throw new Error(`Selected revision unavailable: ${pin.assetId}/${revisionId}`);
      missingParents.push(revisionId);
      break;
    }
    if (record.manifest.assetId !== pin.assetId || record.manifest.revisionId !== revisionId) throw new Error('Revision identity mismatch');
    records.push(record);
    revisionId = record.manifest.parentRevision;
  }
  return { records, missingParents };
}

/** Fixed DOS timestamp, sorted members and seals make generated archives reproducible. */
export function deterministicZip(files) {
  const mtime = new Date(1980, 0, 1);
  return Buffer.from(zipSync(Object.fromEntries(Object.keys(files).sort().map(path =>
    [assetPath(path), [files[path], { level: 6, mtime }]]))));
}

export function buildDeliveryArchive({ profile, group, files, assets = [] }) {
  if (!['runtime', 'editable'].includes(profile)) throw new Error('Invalid delivery profile');
  if (Object.hasOwn(files, 'delivery.json')) throw new Error('delivery.json is reserved');
  const seals = Object.fromEntries(Object.keys(files).sort().map(path => {
    assetPath(path);
    return [path, { bytes: files[path].length, sha256: hashBytes(files[path]) }];
  }));
  return deterministicZip({ ...files, 'delivery.json': Buffer.from(JSON.stringify({ schemaVersion: 1, group, profile, assets, files: seals }, null, 2) + '\n') });
}

/** Each nested revision ZIP retains the standard Kiln import format and material closure. */
export function revisionBundle(record) {
  const { manifest, files, materialResources } = record;
  const prefix = `${manifest.assetId}/${manifest.revisionId}/`;
  const members = { [`${prefix}manifest.json`]: Buffer.from(JSON.stringify(manifest, null, 2)) };
  for (const [name, seal] of Object.entries(manifest.files)) {
    assetPath(name);
    if (!files[name]) throw new Error(`Missing revision member ${name}`);
    members[prefix + name] = verifyBytes(files[name], seal, name);
  }
  const dependencies = (manifest.build?.dependencies ?? []).filter(item => item?.kind === 'kiln.material.v1');
  if (dependencies.length && !materialResources) throw new Error('Editable material closure unavailable');
  if (materialResources) members[prefix + 'materials.kiln.json'] = Buffer.from(JSON.stringify(materialResources));
  const decodedBytes = Object.values(members).reduce((sum, bytes) => sum + bytes.length, 0);
  if (decodedBytes > 64 * 1024 * 1024) throw new Error('Revision bundle exceeds import limit');
  return deterministicZip(members);
}
