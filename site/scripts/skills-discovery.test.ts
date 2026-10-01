/**
 * The well-known skills index is published with a sha256 per artifact, so the
 * two properties that matter are that the digests describe the bytes actually
 * served, and that they do not move unless a skill does. A tar carrying real
 * mtimes would satisfy the first and quietly break the second on every build.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { expect, test } from 'bun:test';

import { buildSkillsDiscovery } from './build-skills-discovery.mjs';
import { docsDirectory, skillsDirectory } from './source-dirs.mjs';

// The directory the build publishes from (KILN_SITE_SKILLS_DIR, else the docs directory's sibling skills/).
const SKILLS = skillsDirectory();
const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Read a ustar archive back as a path -> bytes map, and its pinned header fields. */
function untar(bytes: Buffer) {
  const files = new Map<string, Buffer>();
  const stamps: { mode: string; uid: string; gid: string; mtime: string }[] = [];
  const field = (block: Buffer, start: number, length: number) =>
    block.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
  for (let offset = 0; offset + 512 <= bytes.byteLength; ) {
    const header = bytes.subarray(offset, offset + 512);
    const name = field(header, 0, 100);
    if (!name) break;
    expect(field(header, 257, 6)).toBe('ustar');
    const size = Number.parseInt(field(header, 124, 12), 8);
    stamps.push({
      mode: field(header, 100, 8),
      uid: field(header, 108, 8),
      gid: field(header, 116, 8),
      mtime: field(header, 136, 12),
    });
    files.set(name, Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return { files, stamps };
}

async function build() {
  const out = await mkdtemp(join(tmpdir(), 'kiln-skills-discovery-'));
  const index = await buildSkillsDiscovery({ out });
  return { out, index };
}

test('the skills directory follows the docs directory unless it is named', () => {
  const site = resolve('/work/site');
  expect(skillsDirectory({}, site)).toBe(resolve('/work/skills'));
  expect(docsDirectory({}, site)).toBe(resolve('/work/docs'));
  const engineDocs = resolve('/engine/docs');
  expect(skillsDirectory({ KILN_SITE_DOCS_DIR: engineDocs }, site)).toBe(resolve('/engine/skills'));
  expect(skillsDirectory({ KILN_SITE_DOCS_DIR: engineDocs, KILN_SITE_SKILLS_DIR: resolve('/other/skills') }, site)).toBe(resolve('/other/skills'));
  expect(skillsDirectory({ KILN_SITE_SKILLS_DIR: '../elsewhere/skills' }, site)).toBe(resolve('/work/elsewhere/skills'));
});

test('every published digest is the sha256 of the bytes actually served', async () => {
  const { out, index } = await build();
  try {
    expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
    // Every skill directory has to appear, or a skill is silently unpublished.
    const directories = (await readdir(SKILLS, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(index.skills.map((skill) => skill.name)).toEqual(directories);

    for (const skill of index.skills) {
      expect(['skill-md', 'archive']).toContain(skill.type);
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      expect(skill.url.startsWith('/.well-known/agent-skills/')).toBe(true);
      expect(skill.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      const served = await readFile(
        join(out, skill.url.replace('/.well-known/agent-skills/', '')),
      );
      expect(skill.digest).toBe(sha256(served));
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('an archive carries SKILL.md at its root and reproduces the skill exactly', async () => {
  const { out, index } = await build();
  try {
    const archives = index.skills.filter((skill) => skill.type === 'archive');
    // A passing loop over an empty list would assert nothing.
    expect(archives.length).toBeGreaterThan(0);
    for (const skill of archives) {
      const { files, stamps } = untar(
        Buffer.from(gunzipSync(await readFile(join(out, `${skill.name}.tar.gz`)))),
      );
      // "files are placed at the archive root, not nested in a wrapper directory"
      expect(files.has('SKILL.md')).toBe(true);
      expect([...files.keys()].some((path) => path.startsWith(`${skill.name}/`))).toBe(false);
      for (const [path, bytes] of files)
        expect(sha256(bytes)).toBe(sha256(await readFile(join(SKILLS, skill.name, path))));
      // The determinism the published digest depends on, asserted at the source
      // rather than only through a repeat build.
      for (const stamp of stamps) expect(stamp).toEqual({ mode: '0000644', uid: '0000000', gid: '0000000', mtime: '00000000000' });
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('two builds of an unchanged tree publish identical digests', async () => {
  const first = await build();
  const second = await build();
  try {
    expect(second.index).toEqual(first.index);
  } finally {
    await rm(first.out, { recursive: true, force: true });
    await rm(second.out, { recursive: true, force: true });
  }
});
