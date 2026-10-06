import { expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

it('declares Node commands and the files needed by an installed workspace', async () => {
  const pkg = JSON.parse(await readFile(resolve(import.meta.dir, '../../package.json'), 'utf8'));
  expect(pkg.name).toBe('@instruktlabs/kiln');
  expect(pkg.private).not.toBe(true);
  expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
  expect(pkg.repository.url).toBe('git+https://github.com/instruktlabs/kiln.git');
  expect(pkg.bugs.url).toBe('https://github.com/instruktlabs/kiln/issues');
  expect(pkg.bin.kiln).toBe('./dist/cli.mjs');
  expect(pkg.bin['kiln-init']).toBe('./scripts/create-workspace.mjs');
  expect(pkg.bin['kiln-mcp']).toBe('./dist/mcp-server.mjs');
  for (const path of [
    'dist/*.mjs',
    'scripts/create-workspace.mjs',
    'skills/',
    'docs/install.md',
    'docs/sdk.md',
    'src/**/*.mjs',
    'plugin.json',
    '.claude-plugin/',
  ]) {
    expect(pkg.files).toContain(path);
  }
  expect(pkg.files).not.toContain('docs/');
  for (const path of pkg.files as string[])
    expect(path).not.toMatch(/^docs\/(?:plans|reviews|evaluation)(?:\/|$)/);
  for (const [name, file] of Object.entries({
    './geometry': './src/geometry.ts',
    './deform': './src/deform.ts',
    './sweep': './src/sweep.ts',
    './implicit': './src/implicit.ts',
    './programs': './src/program-store.ts',
    './programs/node': './src/program-store-node.ts',
    './cache': './src/build-cache.ts',
    './cache/node': './src/build-cache-node.ts',
  })) {
    const compiled = file.replace('./src/', './lib/').replace(/\.ts$/, '.js');
    expect(pkg.exports[name]).toEqual({
      types: compiled.replace(/\.js$/, '.d.ts'),
      import: compiled,
    });
    expect(
      (await readFile(resolve(import.meta.dir, '../..', file), 'utf8')).length,
    ).toBeGreaterThan(0);
  }
});

it('advertises one version everywhere a client or installer can read it', async () => {
  // The 0.7.0 release bumped `package.json` and added a gate that catches a bump
  // which was never rebuilt. It did not catch the other direction: four separate
  // declarations of the same number stayed at 0.6.0, so every MCP client reported
  // `kiln v0.6.0` against a 0.7.0 engine and all three plugin manifests advertised
  // a version that had not shipped for 21 changes. A bug report citing a version
  // is only useful if the version is true.
  const read = async (file: string) =>
    JSON.parse(await readFile(resolve(import.meta.dir, '../..', file), 'utf8')).version;
  const engine = await read('package.json');
  expect(engine).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  for (const manifest of [
    'plugin.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
  ]) {
    expect(await read(manifest)).toBe(engine);
  }
  const { MCP_SERVER_VERSION } = await import('../mcp-core');
  expect(MCP_SERVER_VERSION).toBe(engine);
  // The literal that `engineIdentity()` reports to a model asking which
  // installation answered. It cannot read `package.json` -- this graph is kept
  // free of import-time node dependencies, per AGENTS.md -- so this assertion is
  // the only thing keeping it true.
  const { ENGINE_VERSION, ENGINE_INSTALL_URL } = await import('../engine-identity');
  expect(ENGINE_VERSION).toBe(engine);
  expect(ENGINE_INSTALL_URL).toMatch(/^file:\/\/.*\/$/);
});
