/**
 * Publish the engine's skills at the RFC 8615 well-known URI, so a harness can
 * fetch them by URL with no clone and no install.
 *
 * Ledger 7.13. The format is Cloudflare's Agent Skills Discovery RFC, v0.2.0,
 * which is what opencode's `skills.urls` key consumes. It is an index at
 * `/.well-known/agent-skills/index.json` naming each skill's artifact and a
 * sha256 of that artifact's raw bytes.
 *
 * URLs are path-absolute, matching the RFC's own example. That is only correct
 * because this site is served at an origin root: `kilnstudio.tools` is the
 * gallery's Pages domain, verified serving `assets/index.json`. A well-known URI
 * has to sit at an origin root to be one at all, so a subpath deployment would
 * need relative URLs here and would not satisfy RFC 8615 anyway.
 *
 * Five of the six skills carry `references/`, so they ship as archives rather
 * than as a bare `SKILL.md`. That makes determinism load-bearing: the digest is
 * published, so an archive whose bytes move on every build publishes a digest
 * that is wrong the moment it is written. Hence a tar built by hand below with
 * every non-content field fixed, rather than a library's or the system tar's
 * defaults, which carry mtimes and uids.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { skillsDirectory } from './source-dirs.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The same engine tree as the docs: KILN_SITE_SKILLS_DIR, else the docs directory's sibling skills/ (source-dirs.mjs).
const SKILLS = skillsDirectory();
const WELL_KNOWN = join(SITE, 'public', '.well-known', 'agent-skills');
const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const URL_PREFIX = '/.well-known/agent-skills';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Every file under a skill, as sorted paths relative to the skill directory. */
async function tree(directory, prefix = '') {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await tree(join(directory, entry.name), relative)));
    else out.push(relative);
  }
  return out.sort();
}

/** `name` and `description` from the SKILL.md frontmatter the spec requires. */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  if (!match) throw new Error('SKILL.md has no YAML frontmatter');
  const fields = new Map();
  for (const line of match[1].split(/\r?\n/u)) {
    const pair = /^([A-Za-z-]+):\s*(.*)$/u.exec(line);
    if (pair) fields.set(pair[1], pair[2]);
  }
  return fields;
}

const BLOCK = 512;

/**
 * One POSIX ustar header. Every field that is not content is pinned: mode 0644,
 * uid and gid 0, mtime 0, empty uname and gname. A tar that embedded a real
 * mtime would change the published digest on every build without any skill
 * having changed.
 */
function ustarHeader(path, size) {
  const header = Buffer.alloc(BLOCK);
  const octal = (value, width) => value.toString(8).padStart(width - 1, '0') + '\0';
  if (Buffer.byteLength(path) > 100) throw new Error(`path too long for ustar: ${path}`);
  header.write(path, 0, 100, 'utf8');
  header.write(octal(0o644, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii');
  header.write(octal(0, 8), 116, 8, 'ascii');
  header.write(octal(size, 12), 124, 12, 'ascii');
  header.write(octal(0, 12), 136, 12, 'ascii');
  // The checksum is defined over the header with its own eight bytes read as
  // spaces, so they are filled before summing and overwritten after.
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

/** A deterministic tar of `[path, bytes]` entries, in the order given. */
function tar(entries) {
  const parts = [];
  for (const [path, bytes] of entries) {
    parts.push(ustarHeader(path, bytes.byteLength), bytes);
    const remainder = bytes.byteLength % BLOCK;
    if (remainder) parts.push(Buffer.alloc(BLOCK - remainder));
  }
  // Two zero blocks terminate the archive.
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

export async function buildSkillsDiscovery({ out = WELL_KNOWN, skills = SKILLS } = {}) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const names = (await readdir(skills, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const published = [];
  for (const name of names) {
    const directory = join(skills, name);
    const files = await tree(directory);
    if (!files.includes('SKILL.md')) throw new Error(`${name}: no SKILL.md`);
    const fields = frontmatter(await readFile(join(directory, 'SKILL.md'), 'utf8'));
    const description = fields.get('description');
    if (fields.get('name') !== name) throw new Error(`${name}: frontmatter name disagrees`);
    if (!description) throw new Error(`${name}: no description`);

    if (files.length === 1) {
      // A lone SKILL.md needs no container, and `skill-md` is one fetch instead
      // of a fetch plus a decompress.
      const bytes = await readFile(join(directory, 'SKILL.md'));
      await mkdir(join(out, name), { recursive: true });
      await writeFile(join(out, name, 'SKILL.md'), bytes);
      published.push({
        name,
        type: 'skill-md',
        description,
        url: `${URL_PREFIX}/${name}/SKILL.md`,
        digest: sha256(bytes),
      });
      continue;
    }

    // "The archive contents represent the skill directory -- files are placed at
    // the archive root, not nested in a wrapper directory."
    const entries = [];
    for (const file of files) entries.push([file, await readFile(join(directory, file))]);
    const archive = gzipSync(tar(entries), { level: 9 });
    await writeFile(join(out, `${name}.tar.gz`), archive);
    published.push({
      name,
      type: 'archive',
      description,
      url: `${URL_PREFIX}/${name}.tar.gz`,
      digest: sha256(archive),
    });
  }

  const index = { $schema: SCHEMA, skills: published };
  await writeFile(join(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = await buildSkillsDiscovery();
  for (const skill of index.skills)
    console.log(`  ${skill.name.padEnd(22)} ${skill.type.padEnd(9)} ${skill.digest.slice(0, 23)}`);
  console.log(`${index.skills.length} skills published at ${URL_PREFIX}/index.json (from the skills directory named by KILN_SITE_SKILLS_DIR, else the docs directory's sibling)`);
}
