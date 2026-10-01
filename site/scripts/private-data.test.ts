import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { buildInfo, finishBuild, siteSourceFiles } from './build-info.mjs';
import { glbJsonText, localNames, privateFindings, scanFiles } from './private-data.mjs';

// A made-up user and machine: the scanner takes the real ones from the operating system at run time.
const names = ['alexq', 'WORKSTATION-7'];
// Fixture values are assembled from parts, so this file holds no literal match for the source scan (verify-site).
const sep = (separator: string, ...parts: string[]) => parts.join(separator);
const address = (...octets: number[]) => octets.join('.');
// The reviewer's finding, with the made-up user: a Windows path as JSON escapes it, in a scene pack's terrain record.
const frameJson = JSON.stringify({ bridge_glb: { path: sep('\\', 'C:', 'Users', 'alexq', 'X', 'kiln-commons', 'showcase', 'golden-gate.glb') } });

function glb(json: object, binary = Buffer.alloc(0)) {
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + (binary.length ? 8 + binChunk.length : 0), 8);
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), ...(binary.length ? [chunk(0x004e4942, binChunk)] : [])]);
}

function tgz(entries: [string, string][]) {
  const blocks: Buffer[] = [];
  for (const [name, text] of entries) {
    const data = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('0', 156, 1, 'ascii');
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe('private data scan', () => {
  test('finds the reviewer\'s terrain-record path and the user name in it', () => {
    const ids = privateFindings(frameJson, { names }).map((finding) => finding.id);
    expect(ids).toContain('local name');
    expect(ids).toContain('drive-absolute user path');
  });

  test('finds each kind of private value', () => {
    const cases: [string, string][] = [
      [`built on ${names[1]} last night`, 'local name'],
      [`see ${sep('/', 'C:', 'Users', 'someone', 'project')}`, 'drive-absolute user path'],
      [`see ${sep('/', '', 'home', 'someone', 'project', 'file.txt')}`, 'POSIX home path'],
      [`see ${sep('/', '', 'Users', 'someone', 'Documents')}/`, 'POSIX home path'],
      [`open file://${sep('/', '', 'C:', 'temp', 'x.html')}`, 'file URL'],
      [`served at ${address(192, 168, 1, 20)}:4180`, 'private network address'],
      [`served at ${address(10, 0, 0, 5)}`, 'private network address'],
      [`served at ${address(172, 20, 4, 1)}`, 'private network address'],
      [`served at ${address(100, 100, 8, 9)}`, 'private network address'],
      [`served at ${sep('.', 'desk', 'tail1234', 'ts', 'net')}`, 'tailnet host'],
      [`-----BEGIN RSA ${'PRIVATE'} KEY-----`, 'private key'],
      [`token ${'AKIA'}${'ABCDEFGHIJKLMNOP'}`, 'credential shape'],
      [`token ${'ghp_'}${'a'.repeat(36)}`, 'credential shape'],
    ];
    for (const [text, id] of cases) expect(privateFindings(text, { names }).map((finding) => finding.id)).toEqual([id]);
  });

  test('leaves ordinary text alone: versions, ranges of numbers, public addresses and generic account names', () => {
    for (const text of ['three 0.186.0, drei 10.7.9, Node 22.23.2', 'Kiln 0.9 and 1.0', 'ports 4400 to 4499', 'https://assets.kilnstudio.tools/farm/r34/', 'a GitHub runner builds it', '8.8.8.8', 'r_76c7a4080e7844e185896b7e1b196e5a']) {
      expect(privateFindings(text, { names: localNames({ KILN_SITE_PRIVATE_NAMES: 'runner,ci' }) })).toEqual([]);
    }
  });

  test('allows the docs placeholder by exact value, in its page only', () => {
    const placeholder = sep('/', 'C:', 'Users', 'you', 'game-assets');
    expect(privateFindings(`root: ${placeholder}`, { names, file: 'docs/collections/index.html' })).toEqual([]);
    expect(privateFindings(`root: ${placeholder}`, { names, file: 'docs/install/index.html' }).length).toBe(1);
    expect(privateFindings(`root: ${placeholder}-2`, { names, file: 'docs/collections/index.html' }).length).toBe(1);
  });

  test('allows only the exact skill placeholder in its exact archive member', () => {
    const value = sep('/', 'C:', 'Users', 'you', 'assets');
    const file = '.well-known/agent-skills/kiln-author-asset.tar.gz';
    const part = 'references/projects-and-materials.md';
    expect(privateFindings(value, { names, file, part })).toEqual([]);
    expect(privateFindings(value, { names, file, part: 'another.md' })).toHaveLength(1);
    expect(privateFindings(`${value}-private`, { names, file, part })).toHaveLength(1);
  });

  test('reads a GLB through its JSON chunk only', () => {
    const inJson = glb({ asset: { version: '2.0', extras: { source: sep('/', 'C:', 'Users', 'alexq', 'model.glb') } } });
    expect(glbJsonText(inJson)).toContain('model.glb');
    const inBinary = glb({ asset: { version: '2.0' } }, Buffer.from(`${names[0]} ${sep('/', 'C:', 'Users', 'alexq')}`));
    expect(privateFindings(glbJsonText(inBinary) ?? '', { names })).toEqual([]);
  });

  test('scans a dist tree: text, GLB JSON, ZIP and gzipped tar entries; a clean file passes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-private-'));
    try {
      await mkdir(join(root, 'scene-packs/golden-gate/g5/terrain'), { recursive: true });
      await writeFile(join(root, 'scene-packs/golden-gate/g5/terrain/frame.json'), frameJson);
      await writeFile(join(root, 'model.glb'), glb({ asset: { version: '2.0', generator: `built on ${names[1]}` } }));
      await writeFile(join(root, 'editable.zip'), zipSync({ 'asset/metadata.json': Buffer.from(`{"from":"${sep('/', '', 'home', 'alexq', 'work')}"}`) }));
      await writeFile(join(root, 'skill.tar.gz'), tgz([['SKILL.md', 'Clean.'], ['references/notes.md', `LAN copy at ${address(192, 168, 4, 4)}`]]));
      await writeFile(join(root, 'index.html'), '<p>Nothing private here.</p>');
      await writeFile(join(root, 'poster.webp'), Buffer.from(`RIFF ${names[0]}`));
      const scan = await scanFiles(root, { names });
      expect(scan.files).toBe(6);
      expect(scan.scanned).toBe(5);
      expect(scan.findings.map((finding) => `${finding.file}|${finding.part}|${finding.id}`).sort()).toEqual([
        'editable.zip|asset/metadata.json|POSIX home path',
        'editable.zip|asset/metadata.json|local name',
        'model.glb|JSON chunk|local name',
        'scene-packs/golden-gate/g5/terrain/frame.json||drive-absolute user path',
        'scene-packs/golden-gate/g5/terrain/frame.json||local name',
        'skill.tar.gz|references/notes.md|private network address',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('build info', () => {
  const commitOf = (directory: string) => ({ commit: directory.includes('engine') ? 'bf98851' : 'abc1234', top: directory.includes('engine') ? '/engine' : '/site-repo', clean: true });

  test('records commits, mode, scene releases and time, and holds no path', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'kiln-empty-receipt-'));
    const info = await buildInfo({ dist, env: { KILN_SITE_PACKS: '1', KILN_SITE_DOCS_DIR: join(tmpdir(), 'engine', 'docs') }, now: new Date('2026-09-30T12:00:00Z'), commitOf });
    await rm(dist, { recursive: true, force: true });
    expect(info.commit).toBe('abc1234');
    expect(info.kilnSitePacks).toBe('1');
    expect(info.commonsPacks).toBe(true);
    expect(info.docs).toEqual({ commit: 'bf98851', sameTreeAsSite: false, clean: true });
    expect(info.skills).toEqual({ commit: 'bf98851', sameTreeAsSite: false, clean: true });
    expect(info.builtAt).toBe('2026-09-30T12:00:00.000Z');
    expect(info.scenePacks).not.toHaveProperty('golden-gate');
    expect(JSON.stringify(info)).not.toMatch(/[A-Za-z]:[\\/]|"\/.*?(?:Users|home)\//);
  });

  test('records only scenes whose verified runtime and sealed pack are in this dist, with output hashes', async () => {
    const site = await mkdtemp(join(tmpdir(), 'kiln-receipt-'));
    try {
      const dist = join(site, 'dist');
      await mkdir(join(site, 'src/data'), { recursive: true });
      await writeFile(join(site, 'src/data/scene-packs.json'), JSON.stringify({ 'golden-gate': { release: 'g5' } }));
      await mkdir(dist);
      await writeFile(join(dist, 'index.html'), '<p>local candidate</p>');
      const { info } = await finishBuild({ dist, site, names, commitOf });
      expect(info.scenePacks).toEqual({});
      const files = JSON.parse(await readFile(join(dist, 'artifact-files.json'), 'utf8'));
      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({ path: 'index.html', bytes: 22 });
      expect(files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(info.artifacts).toMatchObject({ files: 2, manifest: 'artifact-files.json' });
      await writeFile(join(dist, 'index.html'), '<p>changed candidate</p>');
      const next = await finishBuild({ dist, site, names, commitOf });
      expect(next.info.artifacts.sha256).not.toBe(info.artifacts.sha256);
      expect(next.info.artifacts.files).toBe(2);
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });

  test('refuses a dist that carries private data, and writes the record for a clean one', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'kiln-dist-'));
    try {
      await writeFile(join(dist, 'index.html'), '<p>Clean.</p>');
      await writeFile(join(dist, 'frame.json'), frameJson);
      await expect(finishBuild({ dist, site: dist, names, commitOf })).rejects.toThrow('Private data in the build (2)');
      await rm(join(dist, 'frame.json'));
      await finishBuild({ dist, site: dist, names, commitOf, env: { KILN_SITE_PACKS: '0' } });
      const info = JSON.parse(await readFile(join(dist, 'build-info.json'), 'utf8'));
      expect(info.kilnSitePacks).toBe('0');
      expect(info.commonsPacks).toBe(false);
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });
});

test('source receipt includes new source files and sealed public inputs, never cache contents', async () => {
  const site = await mkdtemp(join(tmpdir(), 'kiln-source-receipt-'));
  try {
    await mkdir(join(site, 'src'), { recursive: true });
    await mkdir(join(site, 'public'), { recursive: true });
    await mkdir(join(site, '.cache'), { recursive: true });
    await writeFile(join(site, 'src/new-file.ts'), 'uncommitted source');
    await writeFile(join(site, 'public/model.glb'), 'sealed public model');
    await writeFile(join(site, '.cache/private.txt'), 'not a build input');
    const before = await siteSourceFiles(site);
    expect(before.map(file => file.path)).toEqual(['public/model.glb', 'src/new-file.ts']);
    await writeFile(join(site, 'src/new-file.ts'), 'changed source');
    const after = await siteSourceFiles(site);
    expect(before[1].sha256).not.toBe(after[1].sha256);
  } finally { await rm(site, { recursive: true, force: true }); }
});
