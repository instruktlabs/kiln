import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { packageLocalPlugin } from './package-local-plugin.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith((await realpath(tmpdir())) + sep))
      throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function destination() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'kiln-plugin-package-')));
  roots.push(root);
  return join(root, 'kiln-engine');
}
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('local plugin has portable and Claude identities pinned to the engine', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  const pkg = await readJson(resolve('package.json'));
  const portable = await readJson(join(directory, 'plugin.json'));
  const claude = await readJson(join(directory, '.claude-plugin/plugin.json'));
  expect(portable.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  expect(portable).toMatchObject({
    name: 'kiln-engine',
    version: pkg.version,
    author: { name: 'Instrukt Labs' },
  });
  expect(claude.name).toBe(portable.name);
  expect(claude.version).toBe(portable.version);
  expect(await readJson(join(directory, 'runtime.json'))).toEqual({
    name: pkg.name,
    version: pkg.version,
  });
  expect(portable.extensions['com.openai'].interface.displayName).toBe('Kiln Engine');
  expect(portable.mcpServers).toBeUndefined();
  expect(claude.mcpServers).toBeUndefined();
  const icon = await readFile(join(directory, '.claude-plugin/icon.png'));
  const decoded = PNG.sync.read(icon);
  expect(decoded.width).toBe(512);
  expect(decoded.height).toBe(512);
  expect(icon.length).toBeLessThan(2 * 1024 * 1024);
});

test('bundle registers setup alone and keeps its complete maintained reference and helper', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  expect(await readdir(join(directory, 'skills'))).toEqual(['kiln-setup-workspace']);
  for (const file of ['SKILL.md', 'references/plugin-install.md']) {
    expect(await readFile(join(directory, 'skills/kiln-setup-workspace', file), 'utf8')).toBe(
      await readFile(resolve('skills/kiln-setup-workspace', file), 'utf8'),
    );
  }
  expect(await readFile(join(directory, 'scripts/setup-workspace.mjs'), 'utf8')).toBe(
    await readFile(resolve('scripts/setup-plugin-workspace.mjs'), 'utf8'),
  );
  const entries = await readdir(directory);
  for (const excluded of [
    'src',
    'dist',
    'node_modules',
    'examples',
    '.mcp.json',
    'mcp.json',
    '.app.json',
    'CLAUDE.md',
    'AGENTS.md',
    'package.json',
    'hooks',
  ])
    expect(entries).not.toContain(excluded);
});

test('bundle retains an exact inventory and deterministic hashes', async () => {
  const first = await destination();
  const second = await destination();
  const result = await packageLocalPlugin(first);
  await packageLocalPlugin(second);
  const receipt = await readJson(join(first, 'package-provenance.json'));
  expect(receipt.kind).toBe('kiln-local-plugin');
  expect(receipt.engineVersion).toBe((await readJson(resolve('package.json'))).version);
  expect(Object.keys(receipt.files).length).toBe(result.files);
  for (const [file, digest] of Object.entries(receipt.files)) {
    expect(digest).toBe(
      `sha256:${createHash('sha256')
        .update(await readFile(join(first, file)))
        .digest('hex')}`,
    );
    expect(await readFile(join(first, file))).toEqual(await readFile(join(second, file)));
  }
});

test('creation refuses even an empty existing output directory', async () => {
  const directory = await destination();
  await mkdir(directory);
  await expect(packageLocalPlugin(directory)).rejects.toThrow('exist');
  expect(await readdir(directory)).toEqual([]);
});

test('check reports source drift and unexpected files without modifying output', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  expect(await packageLocalPlugin(directory, { check: true })).toMatchObject({ current: true });
  const target = join(directory, 'runtime.json');
  await writeFile(target, 'edited');
  await expect(packageLocalPlugin(directory, { check: true })).rejects.toThrow('runtime.json');
  expect(await readFile(target, 'utf8')).toBe('edited');
});

test('check rejects extra components even when the known files still match', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  await writeFile(join(directory, '.mcp.json'), '{}');
  await expect(packageLocalPlugin(directory, { check: true })).rejects.toThrow('.mcp.json');
});

test('check never creates a missing output', async () => {
  const directory = await destination();
  await expect(packageLocalPlugin(directory, { check: true })).rejects.toThrow();
  await expect(readdir(directory)).rejects.toThrow();
});

test('checked-in marketplace bundle matches maintained sources and both catalogs select it', async () => {
  await expect(
    packageLocalPlugin(resolve('plugins/kiln-engine'), { check: true }),
  ).resolves.toMatchObject({ current: true });
  const claude = await readJson(resolve('.claude-plugin/marketplace.json'));
  const codex = await readJson(resolve('.agents/plugins/marketplace.json'));
  expect(claude.name).toBe('instruktlabs');
  expect(codex.name).toBe('instruktlabs');
  expect(claude.plugins).toHaveLength(1);
  expect(codex.plugins).toHaveLength(1);
  expect(claude.plugins[0]).toMatchObject({ name: 'kiln-engine', source: './plugins/kiln-engine' });
  expect(codex.plugins[0]).toMatchObject({
    name: 'kiln-engine',
    source: { source: 'local', path: './plugins/kiln-engine' },
  });
});
