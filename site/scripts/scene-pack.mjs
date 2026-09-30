import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPath, hashBytes } from './mirror-core.mjs';
import { checkCeiling, measureFrameRuntime, stageFrameRuntime, stagedRuntimeDirectory } from './scene-runtime.mjs';
import { PACK_DIRECTORY, resolveScenesDir } from './scene-source.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NOTICES = 'THIRD-PARTY-NOTICES.txt';
export const PACK_SCHEMA = 'kiln.scene-pack/1';
/** Scenes whose packs the site can serve, and where their standalone builds sit in a scenes workspace. */
export const SCENE_SOURCES = {
  farm: 'packages/farm/dist/m4/standalone',
  'golden-gate': 'packages/golden-gate/dist/standalone',
  'foundry-floor': 'packages/foundry-floor/dist/standalone',
};
/** Scenes staged as a standalone build (its public chunk served as built) rather than built by the site. */
export const FRAME_SCENES = ['golden-gate', 'foundry-floor'];
const RECORDED = ['id', 'release', 'three', 'sealedFiles', 'sealedBytes', 'totalFiles', 'totalBytes', 'packJsonSha256', 'sha256sumsSha256', 'noticesSha256'];
const RUNTIME_RECORDED = ['kind', 'file', 'bytes', 'gzipBytes', 'gzipMethod', 'sha256', 'modulesSha256'];

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
 * matches its digest and size, and nothing unsealed sits in any directory of the pack. `assets` holds
 * pack.json, SHA256SUMS and the sealed directories (a build may also leave its own chunk beside
 * them, which is not part of the pack); the notices file sits beside `assets`.
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
  const files = [];
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
    files.push({ path, bytes: bytes.length, sha256: digest });
  }
  for (const entry of await readdir(assets, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const path of await filesBelow(join(assets, entry.name), entry.name)) {
      if (!sums.has(path)) throw new Error(`Unsealed file in the scene pack: ${path}`);
    }
  }
  return {
    id: manifest.id,
    release: manifest.release,
    three: manifest.three,
    paths: [...sums.keys()],
    files,
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
  // `files` (every sealed path with its size and digest) is part of both inventories, so the copy is compared file by file.
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
    source: previous.source ?? SCENE_SOURCES[inventory.id] ?? `packages/${inventory.id}/dist/standalone`,
    base: `/${PACK_DIRECTORY}/${inventory.id}/${inventory.release}/`,
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
export function comparePackRecord(record, inventory, id = inventory?.id) {
  if (!record) return [`scene-packs.json has no record for ${id}`];
  return RECORDED.filter((key) => record[key] !== inventory[key]).map(
    (key) => `${key}: catalog ${JSON.stringify(record[key])}, pack ${JSON.stringify(inventory[key])}`,
  );
}

/** Differences between a recorded standalone runtime and its measurement; empty when they agree. */
export function compareRuntimeRecord(record, measured) {
  if (!record) return ['the record has no runtime for this standalone build'];
  return RUNTIME_RECORDED.filter((key) => record[key] !== measured[key]).map(
    (key) => `runtime.${key}: catalog ${JSON.stringify(record[key])}, build ${JSON.stringify(measured[key])}`,
  );
}

/** The directory under public/ that the record's `base` maps to. */
export function stagedPackDirectory(record, site = SITE) {
  if (!new RegExp(`^/${PACK_DIRECTORY}/[a-z0-9-]+/[a-z0-9]+/$`).test(record?.base ?? '')) throw new Error(`Unexpected scene pack base: ${record?.base}`);
  return resolve(site, 'public', record.base.replace(/^\/+/, ''));
}

const catalogFile = (site) => join(site, 'src/data/scene-packs.json');
const environmentSource = (id, env) => env[`KILN_SITE_SCENE_PACK_DIR_${id.toUpperCase().replaceAll('-', '_')}`] ?? (id === 'farm' ? env.KILN_SITE_SCENE_PACK_DIR : undefined);

/**
 * Stage the scene packs from the scenes workspace into ignored public/ so the site serves them. A
 * missing workspace or pack is a skip (the scene keeps its status panel, and anything staged by an
 * earlier run is removed so the output never carries a pack its page does not use); a pack that is
 * present but wrong is an error. `--record` rewrites the catalog record; otherwise the record must
 * match the pack. A standalone-built scene (Golden Gate) also stages its public chunk, byte for byte,
 * after the single-copy and hash checks (scripts/scene-runtime.mjs). Only the packs the catalog names
 * stay staged. `--scene <id>` limits the run to one scene; `--source <dir>` needs `--scene`. `--hashes`
 * prints every sealed file's SHA-256 and size as verified, with the pack's own digests.
 */
export async function main(argv = process.argv.slice(2), env = process.env, site = SITE) {
  const option = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const only = option('--scene');
  if (only && !(only in SCENE_SOURCES)) throw new Error(`Unknown scene: ${only}`);
  if (option('--source') && !only) throw new Error('--source needs --scene');
  const record = argv.includes('--record');
  const hashes = argv.includes('--hashes');
  const catalog = existsSync(catalogFile(site)) ? JSON.parse(await readFile(catalogFile(site), 'utf8')) : {};
  const scenes = resolveScenesDir({ env, site });
  const served = join(site, 'public', PACK_DIRECTORY);
  if (!only) await rm(served, { recursive: true, force: true });
  const staged = [];
  for (const id of only ? [only] : Object.keys(SCENE_SOURCES)) {
    const current = catalog[id];
    const explicit = option('--source') ?? environmentSource(id, env);
    const source = explicit ? resolve(site, explicit) : scenes ? resolve(scenes, current?.source ?? SCENE_SOURCES[id]) : null;
    const frame = FRAME_SCENES.includes(id);
    if (only) await rm(join(served, id), { recursive: true, force: true });
    if (frame) await rm(stagedRuntimeDirectory(id, site), { recursive: true, force: true });
    if (!source || !existsSync(join(source, 'assets/pack.json'))) {
      console.log(`Scene pack ${id} not staged: ${source ? `no pack at ${source}` : 'no scenes workspace (KILN_SITE_SCENES_DIR) or --source'}. The scene keeps its status panel.`);
      continue;
    }
    const inventory = await verifyPack(join(source, 'assets'), join(source, NOTICES));
    if (hashes) {
      for (const file of inventory.files) console.log(`ok  ${file.sha256}  ${String(file.bytes).padStart(10)}  ${id}/${inventory.release}/${file.path}`);
      console.log(`${id} ${inventory.release}: ${inventory.files.length} of ${inventory.sealedFiles} sealed files match SHA256SUMS and pack.json (digest and size), ${inventory.sealedBytes} bytes; pack.json sha256 ${inventory.packJsonSha256}; SHA256SUMS sha256 ${inventory.sha256sumsSha256}; ${NOTICES} sha256 ${inventory.noticesSha256}.`);
    }
    const runtime = frame ? await measureFrameRuntime({ id, source }) : null;
    if (runtime) {
      const { measurement } = runtime;
      const fit = checkCeiling(id, measurement);
      console.log(`Runtime ${id}: ${measurement.file} ${measurement.bytes} bytes, ${measurement.gzipBytes} bytes gzip (${measurement.gzipMethod}), sha256 ${measurement.sha256}; ${fit.percent.bytes}% and ${fit.percent.gzipBytes}% of the D-15 ceiling ${fit.ceiling.bytes} / ${fit.ceiling.gzipBytes} bytes; ${Object.entries(measurement.copies).map(([name, copies]) => `${name} ${copies.length}`).join(', ')} (copies in bundle-modules.json, sha256 ${runtime.record.modulesSha256}); kit three facade ${measurement.facade ? 'present' : 'absent'}.`);
    }
    if (record) {
      catalog[id] = { ...packRecord(inventory, current), ...(runtime ? { runtime: runtime.record } : {}) };
      console.log(`Recorded scene pack ${id} ${inventory.release}: ${inventory.totalBytes} bytes in ${inventory.totalFiles} files${runtime ? `; runtime ${runtime.record.file}, ${runtime.record.bytes} bytes` : ''}.`);
    } else {
      const differences = [...comparePackRecord(current, inventory, id), ...(runtime ? compareRuntimeRecord(current?.runtime, runtime.record) : [])];
      if (differences.length) {
        throw new Error(`The ${id} scene pack at ${source} disagrees with src/data/scene-packs.json (${differences.join('; ')}). Review it, then run node scripts/scene-pack.mjs --scene ${id} --record.`);
      }
    }
    const target = stagedPackDirectory(catalog[id] ?? current, site);
    await rm(target, { recursive: true, force: true });
    await stagePack({ source, target });
    if (runtime) await stageFrameRuntime({ id, source, measurement: runtime, packBase: (catalog[id] ?? current).base, site });
    console.log(`Staged scene pack ${id} ${inventory.release} (${inventory.totalFiles} files, ${inventory.totalBytes} bytes, ${inventory.sealedFiles} verified against SHA256SUMS) into ${target}.`);
    staged.push(inventory);
  }
  if (record) await writeFile(catalogFile(site), `${JSON.stringify(catalog, null, 2)}\n`);
  return staged;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
