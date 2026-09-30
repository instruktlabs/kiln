import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The files that have to be on the asset host before KILN_SITE_PACKS can be 1: every pinned file in
 * `src/data/mirror-manifest.json` plus the exact GLBs extracted from the sealed Farm archive in
 * `src/data/upload-manifest.json`. Nothing here uploads anything; this reads the two checked-in manifests and
 * prints what the owner would upload and what to check afterwards, so the list is never a number remembered from an
 * earlier report.
 *
 *   node scripts/upload-set.mjs
 */
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA256 = /^[0-9a-f]{64}$/;

const groupOf = (path) => path.split('/').slice(0, 2).join('/');

export function summarizeUploadSet(mirror, upload) {
  const problems = [];
  const groups = new Map();
  const seen = new Map();
  const mirrorPaths = new Set((mirror.files ?? []).map((record) => record.path));
  const count = (source, records, base) => {
    for (const record of records ?? []) {
      if (typeof record?.path !== 'string' || !record.path || record.path.startsWith('/') || record.path.includes('..')) {
        problems.push(`${source}: a record has no usable path (${JSON.stringify(record)?.slice(0, 80)})`);
        continue;
      }
      if (!Number.isInteger(record.bytes) || record.bytes < 0) problems.push(`${record.path}: bytes is not a whole number`);
      if (!SHA256.test(record.sha256 ?? '')) problems.push(`${record.path}: sha256 is not 64 hex characters`);
      if (seen.has(record.path)) problems.push(`${record.path}: listed in ${seen.get(record.path)} and ${source}`);
      seen.set(record.path, source);
      if (record.url !== undefined && record.url !== `${base}${record.path}`) problems.push(`${record.path}: url is not ${base}${record.path}`);
      const group = `${source === 'upload-manifest' ? 'extracted ' : ''}${groupOf(record.path)}`;
      const entry = groups.get(group) ?? { files: 0, bytes: 0 };
      entry.files += 1;
      entry.bytes += Number.isInteger(record.bytes) ? record.bytes : 0;
      groups.set(group, entry);
    }
  };
  count('mirror-manifest', mirror.files, mirror.base);
  count('upload-manifest', upload.files, upload.base);
  // An extracted GLB is a member of an archive that is itself in the mirror; one that names another archive would be unverifiable.
  for (const record of upload.files ?? []) {
    if (!mirrorPaths.has(record.archive)) problems.push(`${record.path}: its archive ${record.archive} is not a pinned mirror file`);
  }
  const total = { files: 0, bytes: 0 };
  for (const entry of groups.values()) {
    total.files += entry.files;
    total.bytes += entry.bytes;
  }
  return { mirrorFiles: mirror.files?.length ?? 0, extractedFiles: upload.files?.length ?? 0, groups: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, entry]) => ({ group, ...entry })), total, problems };
}

async function main() {
  const readJson = async (name) => JSON.parse(await readFile(join(SITE, 'src/data', name), 'utf8'));
  const summary = summarizeUploadSet(await readJson('mirror-manifest.json'), await readJson('upload-manifest.json'));
  console.log(`Upload set: ${summary.mirrorFiles} pinned mirror files and ${summary.extractedFiles} extracted Farm GLBs; ${summary.total.files} files, ${summary.total.bytes.toLocaleString('en-US')} bytes. Nothing is uploaded by this script.`);
  for (const { group, files, bytes } of summary.groups) console.log(`  ${group.padEnd(40)} ${String(files).padStart(4)} files ${String(bytes).padStart(13)} bytes`);
  console.log(`Problems: ${summary.problems.length}`);
  for (const problem of summary.problems) console.log(`  ${problem}`);
  if (summary.problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
