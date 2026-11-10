import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { fetchPinnedFile, verifyBytes } from './mirror-core.mjs';

const SITE = resolve(import.meta.dirname, '..');
const BASE = 'https://assets.kilnstudio.tools/';
const digest = /^[a-f0-9]{64}$/;
const MAX_BYTES = 512 * 1024 * 1024;
function runtimePath(path, directory = false) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p => p === '.' || p === '..' || p.startsWith('.'))) throw new Error(`Unsafe game path: ${path}`);
  if (directory && path.endsWith('/')) return;
  if (['index.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt'].includes(path)) return;
  if (!/^(?:assets|fonts)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|json|wasm|glb|gltf|bin|png|jpg|jpeg|webp|avif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|ktx2)$/.test(path)) throw new Error(`Not a compiled game runtime file: ${path}`);
  if (/\b(?:package|tsconfig|manifest\.webmanifest)\b/i.test(path)) throw new Error(`Authoring file in game: ${path}`);
}
function seal(record) {
  if (!digest.test(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > MAX_BYTES) throw new Error('Invalid game file seal');
}
export function validateGameManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.base !== BASE || !Array.isArray(manifest.games)) throw new Error('Invalid game input manifest');
  const ids = new Set();
  for (const game of manifest.games) {
    if (game.id !== 'h-7' || ids.has(game.id) || !/^[a-f0-9]{40}$/.test(game.sourceCommit)) throw new Error('Invalid or duplicate game identity');
    ids.add(game.id); seal(game);
    if (game.path !== `game-inputs/${game.id}/${game.sourceCommit}/${game.sha256}.zip`) throw new Error('Game archive must use its immutable commit and digest path');
    if (!Array.isArray(game.files) || !game.files.length) throw new Error('Missing game file inventory');
    const names = new Set();
    let total = 0;
    for (const file of game.files) {
      runtimePath(file.path); seal(file); total += file.bytes;
      if (names.has(file.path.toLowerCase())) throw new Error(`Duplicate game file: ${file.path}`);
      names.add(file.path.toLowerCase());
    }
    if (!names.has('index.html') || total > MAX_BYTES) throw new Error('Missing game document or excessive game size');
  }
  return manifest.games;
}

// Read the ZIP directory before decompression: unzipSync alone silently overwrites duplicates
// and does not expose Unix symlink attributes. ZIP64, encrypted and multi-disk inputs are not accepted.
function zipEntries(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22) throw new Error('Truncated ZIP');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end < bytes.length - 65557 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw new Error('Invalid ZIP end');
  const count = bytes.readUInt16LE(end + 10);
  if (bytes.readUInt32LE(end + 4) !== 0 || count !== bytes.readUInt16LE(end + 8) || count === 65535) throw new Error('Unsupported ZIP layout');
  let at = bytes.readUInt32LE(end + 16), total = 0;
  const start = at, names = new Set();
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const flags = bytes.readUInt16LE(at + 8), type = (bytes.readUInt32LE(at + 38) >>> 16) & 0xf000;
    if ((flags & 1) || ![0, 0x8000, 0x4000].includes(type)) throw new Error('ZIP member must be a regular file or directory, never a symlink');
    const length = bytes.readUInt16LE(at + 28);
    const path = bytes.toString('utf8', at + 46, at + 46 + length);
    runtimePath(path, true);
    if (names.has(path.toLowerCase())) throw new Error(`Duplicate ZIP entry: ${path}`);
    names.add(path.toLowerCase());
    total += bytes.readUInt32LE(at + 24);
    if (total > MAX_BYTES) throw new Error('Game ZIP exceeds expanded size budget');
    if (type === 0x4000 && !path.endsWith('/')) throw new Error('ZIP directory has a file path');
    at += 46 + length + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  if (at !== end || at - start !== bytes.readUInt32LE(end + 12)) throw new Error('Invalid ZIP directory size');
  return names;
}
export function checkedGameArchive(bytes, game) {
  validateGameManifest({ schemaVersion: 1, base: BASE, games: [game] });
  verifyBytes(bytes, game);
  const entries = zipEntries(bytes);
  const files = unzipSync(bytes);
  const expected = new Set(game.files.map(file => file.path));
  for (const [path, content] of Object.entries(files)) {
    if (!entries.has(path.toLowerCase())) throw new Error('ZIP directory/member mismatch');
    if (path.endsWith('/')) continue;
    if (!expected.has(path)) throw new Error(`Unknown game file: ${path}`);
    if (/\.(?:js|css|html)$/.test(path) && /sourceMappingURL\s*=/.test(new TextDecoder('utf-8', { fatal: true }).decode(content))) throw new Error(`Source map reference in ${path}`);
  }
  for (const file of game.files) {
    if (!files[file.path]) throw new Error(`Missing game file: ${file.path}`);
    verifyBytes(files[file.path], file);
  }
  return files;
}
async function manifestAt(site) {
  return validateGameManifest(JSON.parse(await readFile(join(site, 'src/data/game-inputs.json'), 'utf8')));
}
export async function stageGameInputs({ site = SITE, dist = join(site, 'dist'), env = process.env } = {}) {
  for (const game of await manifestAt(site)) {
    const archive = await fetchPinnedFile(game, { mirror: env.KILN_ASSET_MIRROR, cache: join(site, '.cache/game-inputs'), base: BASE });
    const files = checkedGameArchive(await readFile(archive), game);
    const target = resolve(dist, 'play', game.id);
    // Identity is fixed by validateGameManifest; only this generated game directory is replaced.
    if (target !== resolve(dist, 'play/h-7')) throw new Error('Unsafe game destination');
    await rm(target, { recursive: true, force: true });
    for (const file of game.files) {
      await mkdir(dirname(join(target, file.path)), { recursive: true });
      await writeFile(join(target, file.path), files[file.path]);
    }
    console.log(`Game inputs: ${game.id}, compiled archive and ${game.files.length} files SHA-256 verified.`);
  }
}
export async function verifyStagedGames({ site = SITE, dist = join(site, 'dist'), allowMissingManifest = false } = {}) {
  const result = {};
  const games = await manifestAt(site).catch(error => {
    if (allowMissingManifest && error.code === 'ENOENT') return [];
    throw error;
  });
  for (const game of games) {
    const target = join(dist, 'play', game.id), actual = [];
    async function walk(dir, prefix = '') {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + entry.name;
        if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
        else if (entry.isFile()) actual.push(path);
        else throw new Error('Non-regular staged game file');
      }
    }
    await walk(target);
    if (JSON.stringify(actual.sort()) !== JSON.stringify(game.files.map(f => f.path).sort())) throw new Error('Staged game inventory differs from seal');
    for (const file of game.files) verifyBytes(await readFile(join(target, file.path)), file);
    result[game.id] = { sourceCommit: game.sourceCommit, archiveSha256: game.sha256, files: game.files.length, bytes: game.files.reduce((sum, f) => sum + f.bytes, 0) };
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await stageGameInputs();
