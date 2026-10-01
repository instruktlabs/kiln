import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = 'kiln-source-snapshot.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = records => hash(JSON.stringify(records));

/** Copy only the two explicit public source trees into a new immutable build-input snapshot. */
export async function createSourceSnapshot({ engine, out, identity }) {
  if (existsSync(out)) throw new Error(`Source snapshot destination already exists: ${out}`);
  if (!identity) {
    const git = args => execFileSync('git', ['-C', engine, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    identity = { commit: git(['rev-parse', '--short', 'HEAD']), clean: git(['status', '--porcelain']) === '', diffSha256: hash(git(['diff', '--binary', 'HEAD', '--', 'docs', 'skills'])), diffScope: ['docs', 'skills'] };
  }
  const files = [];
  async function copy(relative) {
    const entries = await readdir(join(engine, relative), { withFileTypes: true });
    await mkdir(join(out, relative), { recursive: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.env')) throw new Error('A public source snapshot cannot include environment files');
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await copy(path);
      else if (entry.isFile()) {
        const bytes = await readFile(join(engine, path));
        await writeFile(join(out, path), bytes);
        files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
      } else throw new Error(`Unsupported source snapshot entry: ${path}`);
    }
  }
  for (const kind of ['docs', 'skills']) await copy(kind);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { schema: 'kiln.source-snapshot/1', ...identity, files, filesSha256: digest(files) };
  await writeFile(join(out, FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Validate the copied bytes before naming their original Git source; never inherit the enclosing site's head. */
export function snapshotSource(directory) {
  const root = dirname(directory);
  const file = join(root, FILE);
  if (!['docs', 'skills'].includes(basename(directory)) || !existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.schema !== 'kiln.source-snapshot/1' || digest(manifest.files) !== manifest.filesSha256) throw new Error('Invalid source snapshot manifest');
  for (const record of manifest.files) {
    if (!/^(docs|skills)\//.test(record.path) || record.path.includes('..') || record.path.includes('\\')) throw new Error('Unsafe source snapshot path');
    const bytes = readFileSync(join(root, record.path));
    if (bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw new Error(`Source snapshot bytes changed: ${record.path}`);
  }
  return { commit: manifest.commit, clean: manifest.clean, top: root, diffSha256: manifest.diffSha256, filesSha256: digest(manifest.files.filter(record => record.path.startsWith(`${basename(directory)}/`))), snapshotSha256: manifest.filesSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [engine, out] = process.argv.slice(2);
  if (!engine || !out) throw new Error('Usage: bun scripts/source-snapshot.mjs <engine-root> <new-snapshot-directory>');
  const manifest = await createSourceSnapshot({ engine: resolve(engine), out: resolve(out) });
  console.log(`Copied ${manifest.files.length} docs/skills files from ${manifest.commit} (clean=${manifest.clean}); input digest ${manifest.filesSha256}`);
}
