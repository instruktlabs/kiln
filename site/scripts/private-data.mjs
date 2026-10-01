/**
 * Private data that must never ship: a local user or machine name, a local absolute path, a private network address
 * or a credential shape (design review finding 1, engineering review findings 1 and 15, content review finding 1).
 *
 * One scanner serves three boundaries: every file of `dist/` (finalize-site at the end of the build, and
 * verify-site), a staged scene pack before scene-pack copies it, and the tracked source under `site/` (verify-site).
 * Text files are read whole; a GLB is read through its JSON chunk only (its binary buffers are arbitrary bytes);
 * ZIP and gzipped tar archives are read entry by entry.
 *
 * The user and machine names are not written here (this file is public source): they are read from the operating
 * system at run time, plus any names in `KILN_SITE_PRIVATE_NAMES` (comma-separated). Generic account names of hosted
 * runners are skipped, since they are ordinary words ("runner") and name no person.
 */
import { readFile, readdir } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { extname, join, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';

const GENERIC_ACCOUNTS = new Set(['runner', 'runneradmin', 'root', 'node', 'ubuntu', 'user', 'admin', 'administrator', 'builder', 'localhost', 'docker', 'ci', 'build', 'vsts', 'cloudtest']);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The names of this machine and its user, read at run time. */
export function localNames(env = process.env) {
  const names = [];
  try { names.push(userInfo().username); } catch { /* No user record (some containers). */ }
  try { names.push(hostname().split('.')[0]); } catch { /* No host name. */ }
  names.push(...(env.KILN_SITE_PRIVATE_NAMES ?? '').split(','));
  return [...new Set(names.map((name) => name.trim()).filter((name) => name.length >= 3 && !GENERIC_ACCOUNTS.has(name.toLowerCase())))];
}

/** The patterns, in the order they are reported. `names` are matched as whole words, ignoring case. */
export function privatePatterns(names = localNames()) {
  return [
    ...names.map((name) => ({ id: 'local name', pattern: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, 'gi') })),
    { id: 'drive-absolute user path', pattern: /\b[A-Za-z]:(?:\\\\|\\|\/){1,2}Users(?:\\\\|\\|\/)[^\s"'<>`)]*/gi },
    { id: 'POSIX home path', pattern: /(?<![\w.~:-])\/(?:home|Users)\/(?!you\/|me\/|user\/|username\/|<)[A-Za-z0-9._-]+\/[^\s"'<>`)]*/g },
    { id: 'file URL', pattern: /file:\/\/\/[^\s"'<>`)]*/gi },
    { id: 'private network address', pattern: /(?<![\d.])(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}(?![\d.]*\d)/g },
    { id: 'tailnet host', pattern: /\b[\w-]+\.[\w-]+\.ts\.net\b/gi },
    { id: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { id: 'credential shape', pattern: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g },
  ];
}

/**
 * Values that look private and are not: documentation placeholders, allowed by exact value. The key is a path
 * suffix (a published route file or a tracked source file); the value lists the exact matched strings allowed there.
 */
// The values are assembled from parts so that this file does not itself hold a match.
const joined = (separator, ...parts) => parts.join(separator);
export const ALLOWED = [
  // The docs' example collection root on Windows (docs/collections.md in the engine).
  { file: /^docs\/collections\/index\.html$/, value: joined('/', 'C:', 'Users', 'you', 'game-assets') },
  { file: /^\.well-known\/agent-skills\/kiln-author-asset\.tar\.gz$/, part: /^references\/projects-and-materials\.md$/, value: joined('/', 'C:', 'Users', 'you', 'assets') },
  // Test inputs that prove the guards reject such values (escaped backslashes, as the TypeScript source spells them).
  { file: /^site\/scripts\/content-evidence\.test\.ts$/, value: joined('\\\\', 'C:', 'Users', 'Private', 'asset.glb') },
  { file: /^site\/scripts\/content-evidence\.test\.ts$/, value: joined('/', '', 'home', 'private', 'model.glb') },
  { file: /^site\/scripts\/docs\.test\.ts$/, value: joined('/', 'C:', 'Users', 'person', 'file.md') },
  { file: /^site\/scripts\/docs\.test\.ts$/, value: `file:${joined('/', '', '', '', 'tmp', 'report.md')}` },
];

const allowed = (file, part, value, allow) => allow.some((entry) => entry.file.test(file) && (!entry.part || entry.part.test(part)) && entry.value === value);

/** Every private-looking value in `text`, minus the exact allowed ones: [{ id, value }]. */
export function privateFindings(text, { file = '', part = '', names, allow = ALLOWED, patterns = privatePatterns(names) } = {}) {
  const findings = [];
  for (const { id, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/[.,;:]+$/, '');
      if (!allowed(file, part, value, allow)) findings.push({ id, value });
    }
  }
  return findings;
}

/** The JSON chunk of a GLB as text (the only part that can hold names and paths), or null if it is not a GLB. */
export function glbJsonText(bytes) {
  if (bytes.length < 20 || bytes.toString('latin1', 0, 4) !== 'glTF') return null;
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) return null;
  return bytes.toString('utf8', 20, 20 + length);
}

const TEXT = new Set(['.html', '.htm', '.json', '.txt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.astro', '.md', '.mdx', '.xml', '.svg', '.css', '.map', '.webmanifest', '.csv', '.yml', '.yaml', '.toml', '.ps1', '.sh', '.gltf']);

/** Text entries of a gzipped tar (ustar), as [name, bytes]. */
function tarEntries(bytes) {
  const tar = gunzipSync(bytes);
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = Number.parseInt(tar.toString('latin1', offset + 124, offset + 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const prefix = tar.toString('utf8', offset + 345, offset + 500).replace(/\0.*$/s, '');
    const type = tar.toString('latin1', offset + 156, offset + 157);
    if (type === '0' || type === '\0' || type === '') entries.push([prefix ? `${prefix}/${name}` : name, tar.subarray(offset + 512, offset + 512 + size)]);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/** The scannable text of one file: [{ part, text }], where part names an archive entry or the GLB JSON chunk. */
export function scannableParts(name, bytes) {
  const extension = extname(name).toLowerCase();
  if (extension === '.glb') {
    const json = glbJsonText(bytes);
    return json === null ? [] : [{ part: 'JSON chunk', text: json }];
  }
  if (extension === '.zip') {
    return Object.entries(unzipSync(new Uint8Array(bytes))).flatMap(([entry, data]) => scannableParts(entry, Buffer.from(data)).map((part) => ({ part: `${entry}${part.part ? ` (${part.part})` : ''}`, text: part.text })));
  }
  if (extension === '.tgz' || name.toLowerCase().endsWith('.tar.gz')) {
    return tarEntries(bytes).flatMap(([entry, data]) => scannableParts(entry, data).map((part) => ({ part: `${entry}${part.part ? ` (${part.part})` : ''}`, text: part.text })));
  }
  if (TEXT.has(extension) || name.endsWith('.kiln.js')) return [{ part: '', text: bytes.toString('utf8') }];
  return [];
}

async function filesBelow(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await filesBelow(path));
    else if (item.isFile()) files.push(path);
  }
  return files;
}

/**
 * Scan files: every file below `root`, or the listed `files` (paths relative to `root`). Returns the counts and the
 * findings as [{ file, part, id, value }], with `file` relative to `root` in forward slashes, prefixed by `label`.
 */
export async function scanFiles(root, { files, names, allow = ALLOWED, label = '' } = {}) {
  const patterns = privatePatterns(names ?? localNames());
  const list = files ? files.map((file) => join(root, file)) : await filesBelow(root);
  const findings = [];
  let scanned = 0;
  let parts = 0;
  for (const path of list) {
    const file = `${label}${relative(root, path).replaceAll('\\', '/')}`;
    let bytes;
    try { bytes = await readFile(path); } catch { continue; }
    const pieces = scannableParts(path, bytes);
    if (!pieces.length) continue;
    scanned += 1;
    for (const { part, text } of pieces) {
      parts += 1;
      for (const finding of privateFindings(text, { file, part, allow, patterns })) findings.push({ file, part, ...finding });
    }
  }
  return { files: list.length, scanned, parts, patterns: patterns.map((pattern) => pattern.id), findings };
}

/** One line per finding, with the matched value shortened so a report does not repeat a whole path. */
export const describeFinding = ({ file, part, id, value }) => `${file}${part ? ` [${part}]` : ''}: ${id}: ${value.length > 48 ? `${value.slice(0, 45)}...` : value}`;
