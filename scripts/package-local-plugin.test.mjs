import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { packageLocalPlugin } from './package-local-plugin.mjs';
import { workspaceSetupCapabilities } from './create-workspace.mjs';

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

test('local plugin versions independently while retaining its exact engine pin', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  const pkg = await readJson(resolve('package.json'));
  const release = await readJson(resolve('plugins/kiln-engine.release.json'));
  const portable = await readJson(join(directory, 'plugin.json'));
  const claude = await readJson(join(directory, '.claude-plugin/plugin.json'));
  expect(portable.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  expect(portable).toMatchObject({
    name: 'kiln-engine',
    version: release.version,
    author: { name: 'Instrukt Labs' },
  });
  expect(claude.name).toBe(portable.name);
  expect(claude.version).toBe(portable.version);
  expect(claude.icon).toBe('./.claude-plugin/icon.png');
  expect(claude.privacyPolicyUrl).toBe(
    'https://github.com/instruktlabs/kiln/blob/main/docs/local-plugin-privacy.md',
  );
  expect(portable.extensions['com.openai'].interface.privacyPolicyURL).toBe(
    claude.privacyPolicyUrl,
  );
  expect(release.engineVersion).toBe(pkg.version);
  expect(await readJson(join(directory, 'runtime.json'))).toEqual({
    name: pkg.name,
    version: pkg.version,
    harnesses: workspaceSetupCapabilities.harnesses,
  });
  expect(portable.extensions['com.openai'].interface.displayName).toBe('Kiln');
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
  expect(await readFile(join(directory, 'bin/kiln-setup-workspace.mjs'), 'utf8')).toBe(
    await readFile(resolve('scripts/setup-plugin-workspace.mjs'), 'utf8'),
  );
  expect(await readFile(join(directory, 'PRIVACY.md'), 'utf8')).toBe(
    await readFile(resolve('docs/local-plugin-privacy.md'), 'utf8'),
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
    'scripts',
  ])
    expect(entries).not.toContain(excluded);
});

test('the shipped executable runs outside the checkout and is executable on POSIX', async () => {
  const directory = await destination();
  await packageLocalPlugin(directory);
  const script = join(directory, 'bin/kiln-setup-workspace.mjs');
  expect((await readFile(script, 'utf8')).startsWith('#!/usr/bin/env node\n')).toBe(true);
  const run = spawnSync(process.execPath, [script, '--help'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  expect(run.error).toBeUndefined();
  expect(run.status).toBe(0);
  expect(run.stdout).toContain('bin/kiln-setup-workspace.mjs');
  if (process.platform !== 'win32') {
    expect((await stat(script)).mode & 0o111).toBe(0o111);
    const direct = spawnSync(script, ['--help'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(direct.error).toBeUndefined();
    expect(direct.status).toBe(0);
    expect(direct.stdout).toBe(run.stdout);
    await chmod(script, 0o644);
    await expect(packageLocalPlugin(directory, { check: true })).rejects.toThrow('executable');
  }
});

test('bundle retains an exact inventory and deterministic hashes', async () => {
  const first = await destination();
  const second = await destination();
  const result = await packageLocalPlugin(first);
  await packageLocalPlugin(second);
  const receipt = await readJson(join(first, 'package-provenance.json'));
  expect(receipt.kind).toBe('kiln-local-plugin');
  expect(receipt.engineVersion).toBe((await readJson(resolve('package.json'))).version);
  expect(receipt.pluginVersion).toBe(
    (await readJson(resolve('plugins/kiln-engine.release.json'))).version,
  );
  expect(receipt.executables).toEqual(['bin/kiln-setup-workspace.mjs']);
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
