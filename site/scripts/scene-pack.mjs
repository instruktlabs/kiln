import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPath, hashBytes } from './mirror-core.mjs';
import { resolveScenesDir } from './scene-source.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NOTICES = 'THIRD-PARTY-NOTICES.txt';
export const PACK_SCHEMA = 'kiln.scene-pack/1';
/** Directories whose every file must be sealed by SHA256SUMS. */
const SEALED_DIRECTORIES = ['models', 'data', 'licenses'];
const RECORDED = ['id', 'release', 'three', 'sealedFiles', 'sealedBytes', 'totalFiles', 'totalBytes', 'packJsonSha256', 'sha256sumsSha256', 'noticesSha256'];

/** Parse `sha256sum` output: one `<64 hex digits>  <relative path>` per line. */
export function parseSums(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!match) throw new Error(`Malformed SHA256SUMS line: ${line}`);
    const path = assetPath(match[2]);
    if (entries.has(path)) throw new Error(`Duplicate SHA256SUMS entry: ${path}`);
    entries.set(path, match[1]);
  }
  if (!entries.size) throw new Error('SHA256SUMS lists no files');
  return entries;
}

async function filesBelow(directory, prefix) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await filesBelow(join(directory, entry.name), path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported entry in the scene pack: ${path}`);
  }
  return files;
}

/**
 * Verify a scene pack in place: SHA256SUMS and pack.json describe the same files, every file
 * matches its digest and size, and nothing unsealed sits in the sealed directories. `assets` holds
 * pack.json, SHA256SUMS, models/, data/ and licenses/; the notices file sits beside them.
 */
export async function verifyPack(assets, notices) {
  const sumsBytes = await readFile(join(assets, 'SHA256SUMS'));
  const manifestBytes = await readFile(join(assets, 'pack.json'));
  const noticesBytes = await readFile(notices);
  const sums = parseSums(sumsBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== PACK_SCHEMA || !Array.isArray(manifest.files)) {
    throw new Error(`pack.json is not a ${PACK_SCHEMA} manifest`);
  }
  const declared = new Map();
  for (const file of manifest.files) {
    const path = assetPath(file.path);
    if (declared.has(path)) throw new Error(`pack.json lists ${path} twice`);
    declared.set(path, file);
  }
  for (const path of sums.keys()) if (!declared.has(path)) throw new Error(`SHA256SUMS lists ${path}, which pack.json does not`);
  for (const path of declared.keys()) if (!sums.has(path)) throw new Error(`pack.json lists ${path}, which SHA256SUMS does not seal`);
  for (const model of manifest.models ?? []) if (!declared.has(model.path)) throw new Error(`pack.json model ${model.id} is not a sealed file: ${model.path}`);
  for (const path of Object.values(manifest.data ?? {})) if (!declared.has(path)) throw new Error(`pack.json data reference is not a sealed file: ${path}`);
  let sealedBytes = 0;
  for (const [path, digest] of sums) {
    const bytes = await readFile(join(assets, path)).catch((error) => {
      throw new Error(`Sealed scene pack file is missing: ${path}`, { cause: error });
    });
    const file = declared.get(path);
    if (hashBytes(bytes) !== digest || file.sha256 !== digest) {
      throw new Error(`SHA-256 verification failed for ${path}`);
    }
    if (bytes.length !== file.bytes) {
      throw new Error(`Size verification failed for ${path}: pack.json says ${file.bytes}, found ${bytes.length}`);
    }
    sealedBytes += bytes.length;
  }
  for (const directory of SEALED_DIRECTORIES) {
    for (const path of await filesBelow(join(assets, directory), directory)) {
      if (!sums.has(path)) throw new Error(`Unsealed file in the scene pack: ${path}`);
    }
  }
  return {
    id: manifest.id,
    release: manifest.release,
    three: manifest.three,
    paths: [...sums.keys()],
    sealedFiles: sums.size,
    sealedBytes,
    totalFiles: sums.size + 3,
    totalBytes: sealedBytes + sumsBytes.length + manifestBytes.length + noticesBytes.length,
    packJsonSha256: hashBytes(manifestBytes),
    sha256sumsSha256: hashBytes(sumsBytes),
    noticesSha256: hashBytes(noticesBytes),
  };
}

/** Copy a verified pack byte for byte into `target`, then verify the copy the same way. */
export async function stagePack({ source, target }) {
  const assets = join(source, 'assets');
  const notices = join(source, NOTICES);
  const inventory = await verifyPack(assets, notices);
  await rm(target, { recursive: true, force: true });
  for (const path of ['pack.json', 'SHA256SUMS', ...inventory.paths]) {
    await mkdir(dirname(join(target, path)), { recursive: true });
    await copyFile(join(assets, path), join(target, path));
  }
  await copyFile(notices, join(target, NOTICES));
  const { paths, ...copy } = await verifyPack(target, join(target, NOTICES));
  const { paths: sourcePaths, ...original } = inventory;
  if (JSON.stringify(copy) !== JSON.stringify(original) || paths.join() !== sourcePaths.join()) {
    throw new Error('The staged scene pack differs from its source');
  }
  return inventory;
}

/** Fields the catalog records for a verified pack. */
export function packRecord(inventory, previous = {}) {
  return {
    ...previous,
    schema: PACK_SCHEMA,
    id: inventory.id,
    release: inventory.release,
    three: inventory.three,
    source: `packages/${inventory.id}/dist/${inventory.release}/standalone`,
    base: `/scene-packs/${inventory.id}/${inventory.release}/`,
    sealedFiles: inventory.sealedFiles,
    sealedBytes: inventory.sealedBytes,
    totalFiles: inventory.totalFiles,
    totalBytes: inventory.totalBytes,
    packJsonSha256: inventory.packJsonSha256,
    sha256sumsSha256: inventory.sha256sumsSha256,
    noticesSha256: inventory.noticesSha256,
  };
}

/** Differences between the catalog record and a verified pack; empty when they agree. */
export function comparePackRecord(record, inventory) {
  if (!record) return ['farm.json has no scene.pack record'];
  return RECORDED.filter((key) => record[key] !== inventory[key]).map(
    (key) => `${key}: catalog ${JSON.stringify(record[key])}, pack ${JSON.stringify(inventory[key])}`,
  );
}

/** The directory under public/ that the record's `base` maps to. */
export function stagedPackDirectory(record, site = SITE) {
  if (!/^\/scene-packs\/[a-z0-9-]+\/r\d+\/$/.test(record?.base ?? '')) throw new Error(`Unexpected scene pack base: ${record?.base}`);
  return resolve(site, 'public', record.base.replace(/^\/+/, ''));
}

/**
 * Stage the Farm scene pack from the scenes workspace into ignored public/ so the site serves
 * it. A missing workspace or pack is a skip (the island keeps its fallback, and packs staged by
 * an earlier run are removed so the output never carries a pack its page does not use); a pack
 * that is present but wrong is an error. `--record` rewrites the catalog record; otherwise the
 * record must match the pack. Only the pack the record names stays staged.
 */
export async function main(argv = process.argv.slice(2), env = process.env, site = SITE) {
  const option = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const catalog = join(site, 'src/data/packs/farm.json');
  const farm = JSON.parse(await readFile(catalog, 'utf8'));
  const record = farm.scene.pack;
  const scenes = resolveScenesDir({ env, site });
  const explicit = option('--source') ?? env.KILN_SITE_SCENE_PACK_DIR;
  const source = explicit ? resolve(site, explicit) : scenes && record ? resolve(scenes, record.source) : null;
  // This script owns ignored public/scene-packs: it holds the one pack the catalog records, or nothing.
  const served = join(site, 'public', 'scene-packs');
  if (!source || !existsSync(join(source, 'assets/pack.json'))) {
    const removed = existsSync(served);
    if (removed) await rm(served, { recursive: true, force: true });
    console.log(`Farm scene pack not staged: ${source ? `no pack at ${source}` : 'no scenes workspace (KILN_SITE_SCENES_DIR) or --source'}. The Farm island keeps its fallback.${removed ? ' A copy staged earlier was removed.' : ''}`);
    return null;
  }
  const inventory = await verifyPack(join(source, 'assets'), join(source, NOTICES));
  if (argv.includes('--record')) {
    farm.scene.pack = packRecord(inventory, record);
    await writeFile(catalog, `${JSON.stringify(farm, null, 2)}\n`);
    console.log(`Recorded scene pack ${inventory.release}: ${inventory.totalBytes} bytes in ${inventory.totalFiles} files.`);
  } else {
    const differences = comparePackRecord(record, inventory);
    if (differences.length) {
      throw new Error(`The scene pack at ${source} disagrees with src/data/packs/farm.json (${differences.join('; ')}). Review it, then run node scripts/scene-pack.mjs --record.`);
    }
  }
  const target = stagedPackDirectory(record && !argv.includes('--record') ? record : packRecord(inventory), site);
  await rm(served, { recursive: true, force: true });
  await stagePack({ source, target });
  console.log(`Staged scene pack ${inventory.release} (${inventory.totalFiles} files, ${inventory.totalBytes} bytes, ${inventory.sealedFiles} verified against SHA256SUMS) into ${target}.`);
  return inventory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
