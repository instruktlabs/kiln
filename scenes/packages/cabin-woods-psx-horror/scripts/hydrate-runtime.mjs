import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const MAX_ARCHIVE = 64 * 1024 * 1024, MAX_EXPANDED = 512 * 1024 * 1024, MAX_MANIFEST = 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function safeName(name) {
  if (typeof name !== 'string' || !name || name.length > 512 || /[\\:\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Unsafe ZIP/runtime member path');
  return name;
}
function runtimeName(name) {
  safeName(name);
  if (!/^web\/woodland\/(?:assets\/[A-Za-z0-9_.-]+\.(?:glb|png|kiln-metadata\.json)|collection\.json)$/.test(name)) throw Error('Unsupported pinned runtime member');
  return name.slice(4);
}
function sealValid(seal) { return seal && Number.isSafeInteger(seal.bytes) && seal.bytes >= 0 && sha(seal.sha256); }
function match(bytes, seal, name) {
  if (!sealValid(seal) || seal.bytes !== bytes.length || hash(bytes) !== seal.sha256) throw Error('Runtime input seal/hash mismatch: ' + name);
}

/** Admit unique central metadata and local boundaries before any inflation. ZIP64/encryption are unsupported. */
export function admitRuntimeZip(bytes) {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE) throw Error('Archive byte budget exceeded');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  if (end < 0) throw Error('Invalid ZIP end metadata');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || !count || count > 4096 || start + size !== end) throw Error('Unsupported/excessive ZIP metadata');
  const entries = new Map(), aliases = new Set(), ranges = []; let offset = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw Error('Invalid ZIP central entry');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42), next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 0x41 || ![0, 8].includes(method) || compressed === 0xffffffff || expanded === 0xffffffff || local === 0xffffffff || bytes.readUInt16LE(offset + 34)) throw Error('Unsupported ZIP metadata');
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength), name = safeName(rawName.toString('utf8'));
    if (!Buffer.from(name).equals(rawName)) throw Error('Unsafe ZIP filename encoding');
    if (aliases.has(name.toLowerCase())) throw Error('Duplicate/aliased ZIP member: ' + name);
    aliases.add(name.toLowerCase());
    if ((bytes.readUInt32LE(offset + 38) >>> 16 & 0xf000) === 0xa000) throw Error('ZIP symlink member rejected');
    total += expanded;
    if (expanded > MAX_EXPANDED || total > MAX_EXPANDED) throw Error('ZIP expanded size budget exceeded');
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) throw Error('Invalid ZIP local metadata');
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), dataStart = local + 30 + localNameLength + localExtra, dataEnd = dataStart + compressed;
    if (dataEnd > start || !bytes.subarray(local + 30, local + 30 + localNameLength).equals(rawName)) throw Error('ZIP local member boundary/name mismatch');
    if (!(flags & 8) && (bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== expanded)) throw Error('ZIP local size mismatch');
    ranges.push([local, dataEnd]); entries.set(name, { bytes: expanded, compressed }); offset = next;
  }
  if (offset !== end) throw Error('Invalid ZIP central length');
  ranges.sort((a, b) => a[0] - b[0]); for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) throw Error('Overlapping ZIP members');
  return entries;
}
async function noSymlinkAncestors(target) {
  for (let cursor = target;; cursor = path.dirname(cursor)) {
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error('Symlink destination ancestor rejected: ' + cursor); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor); if (parent === cursor) break;
  }
}
async function admitDestination(out, expected) {
  await noSymlinkAncestors(out); let count = 0;
  async function visit(directory, depth = 0) {
    if (depth > 8) throw Error('Destination depth budget exceeded');
    let entries; try { entries = await fs.opendir(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for await (const entry of entries) {
      if (++count > 2048) throw Error('Destination file budget exceeded');
      const target = path.join(directory, entry.name), relative = path.relative(out, target).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw Error('Symlink destination subtree rejected');
      if (entry.isDirectory()) {
        if (![...expected.keys()].some(name => name.startsWith(relative + '/'))) throw Error('Unknown/unsealed existing runtime directory: ' + relative);
        await visit(target, depth + 1); continue;
      }
      if (!entry.isFile() || (!expected.has(relative) && relative !== 'hydration.json')) throw Error('Unknown/unsealed existing runtime member: ' + relative);
      if (relative === 'hydration.json') {
        if ((await fs.stat(target)).size > 4096) throw Error('Existing hydration metadata budget exceeded');
        const prior = JSON.parse(await fs.readFile(target, 'utf8')); if (prior.schemaVersion !== 1 || !sha(prior.selectionSha256)) throw Error('Unsealed existing hydration metadata');
      } else {
        const data = expected.get(relative); if ((await fs.stat(target)).size !== data.length || !(await fs.readFile(target)).equals(data)) throw Error('Existing runtime candidate differs; use a fresh destination: ' + relative);
      }
    }
  }
  await visit(out);
}

/** Import only pinned woodland data after complete metadata, identity, member and destination admission. */
export async function hydrateRuntime({ root, archive, pin } = {}) {
  if (!root || !archive) throw Error('Explicit source root and reviewed scene ZIP are required');
  root = path.resolve(root); await noSymlinkAncestors(root); root = await fs.realpath(root);
  if (!pin) {
    const pinFile = path.join(root, 'runtime-pin.json'); await noSymlinkAncestors(pinFile); const pinStat = await fs.stat(pinFile); if (!pinStat.isFile() || pinStat.size > MAX_MANIFEST) throw Error('Pin byte budget exceeded');
    pin = JSON.parse(await fs.readFile(pinFile, 'utf8'));
  }
  if (pin.schemaVersion !== 1 || typeof pin.release !== 'string' || !/^[a-z0-9-]{1,80}$/.test(pin.release) || !sha(pin.selectionSha256) || pin.maxArchiveBytes !== MAX_ARCHIVE || !Array.isArray(pin.files) || !pin.files.length || pin.files.length > 1024) throw Error('Invalid runtime pin contract');
  const seals = new Map(), aliases = new Set(); let importedBytes = 0;
  for (const seal of pin.files) {
    runtimeName(seal.path); if (!sealValid(seal) || aliases.has(seal.path.toLowerCase())) throw Error('Invalid/duplicate runtime pin member');
    aliases.add(seal.path.toLowerCase());
    importedBytes += seal.bytes; if (importedBytes > MAX_ARCHIVE) throw Error('Runtime import byte budget exceeded'); seals.set(seal.path, seal);
  }
  if (!seals.has('web/woodland/collection.json')) throw Error('Runtime pin contract requires collection entry');
  const archiveStat = await fs.stat(path.resolve(archive)); if (!archiveStat.isFile() || archiveStat.size > pin.maxArchiveBytes) throw Error('Archive byte budget exceeded');
  const bytes = await fs.readFile(path.resolve(archive)), metadata = admitRuntimeZip(bytes), deliveryMeta = metadata.get('delivery.json');
  if (!deliveryMeta || deliveryMeta.bytes > MAX_MANIFEST) throw Error('Missing/excessive delivery manifest');
  for (const name of metadata.keys()) if (name.startsWith('web/woodland/') && !seals.has(name)) throw Error('Unpinned woodland ZIP member: ' + name);
  for (const [name, seal] of seals) if (!metadata.has(name)) throw Error('Missing runtime ZIP member: ' + name); else if (metadata.get(name).bytes !== seal.bytes) throw Error('Runtime ZIP member size/seal mismatch');
  const decoded = unzipSync(bytes, { filter: entry => entry.name === 'delivery.json' || seals.has(entry.name) });
  const delivery = JSON.parse(Buffer.from(decoded['delivery.json']).toString('utf8'));
  if (delivery.schemaVersion !== 1 || delivery.group !== 'cabin-woods-psx-horror' || delivery.profile !== 'scene' || delivery.release !== pin.release || delivery.selectionSha256 !== pin.selectionSha256 || !delivery.files || typeof delivery.files !== 'object' || Array.isArray(delivery.files)) throw Error('Scene delivery identity/release mismatch');
  const delivered = Object.entries(delivery.files);
  if (delivered.length !== metadata.size - 1) throw Error('Incomplete/unsealed scene delivery inventory');
  for (const [name, seal] of delivered) if (name === 'delivery.json' || !metadata.has(safeName(name)) || !sealValid(seal) || metadata.get(name).bytes !== seal.bytes) throw Error('Scene delivery member seal/size mismatch');
  const expected = new Map();
  for (const [name, seal] of seals) {
    const supplied = delivery.files[name]; if (!supplied || supplied.bytes !== seal.bytes || supplied.sha256 !== seal.sha256) throw Error('Pin and delivery seal mismatch');
    const data = Buffer.from(decoded[name]); match(data, seal, name); expected.set(runtimeName(name), data);
  }
  const out = path.join(root, '.runtime'); await admitDestination(out, expected);
  for (const [relative, data] of expected) { const target = path.join(out, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data); }
  const result = { schemaVersion: 1, release: pin.release, selectionSha256: pin.selectionSha256, archiveSha256: hash(bytes), files: expected.size, bytes: importedBytes };
  await fs.writeFile(path.join(out, 'hydration.json'), JSON.stringify(result, null, 2) + '\n'); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Pass the explicit reviewed scene ZIP; no runtime download is implicit.');
  console.log(JSON.stringify(await hydrateRuntime({ root: fileURLToPath(new URL('../', import.meta.url)), archive: process.argv[2] })));
}
