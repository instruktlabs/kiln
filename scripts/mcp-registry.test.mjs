import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = async (path) => JSON.parse(await readFile(fileURLToPath(new URL(path, root)), 'utf8'));

test('server.json describes this package for the official MCP registry', async () => {
  const manifest = await read('package.json');
  const server = await read('server.json');
  expect(manifest.mcpName).toBe(server.name);
  expect(server.name).toMatch(/^io\.github\.instruktlabs\/[a-z0-9.-]+$/);
  expect(server.version).toBe(manifest.version);
  expect(server.description.length).toBeLessThanOrEqual(100);
  expect(server.repository.url).toBe(manifest.homepage);
  const [pkg, ...others] = server.packages;
  expect(others).toEqual([]);
  expect(pkg).toMatchObject({
    registryType: 'npm',
    identifier: manifest.name,
    version: manifest.version,
    transport: { type: 'stdio' },
  });
});

test('server.json starts the MCP server through the default executable', async () => {
  const manifest = await read('package.json');
  const [pkg] = (await read('server.json')).packages;
  // `npx @instruktlabs/kiln` runs the executable named like the unscoped package.
  expect(manifest.bin[manifest.name.split('/')[1]]).toBe('./dist/cli.mjs');
  expect(pkg.packageArguments).toEqual([{ type: 'positional', value: 'mcp' }]);
  const cli = await readFile(fileURLToPath(new URL('src/cli.ts', root)), 'utf8');
  expect(cli).toContain("argv[0] === 'mcp'");
  expect(manifest.bin['kiln-mcp']).toBe('./dist/mcp-server.mjs');
});

test('KILN_WORKSPACE is the only declared variable and is optional', async () => {
  const [pkg] = (await read('server.json')).packages;
  expect(pkg.environmentVariables.map((entry) => [entry.name, entry.isRequired])).toEqual([
    ['KILN_WORKSPACE', false],
  ]);
});

test('server.json stays out of the npm archive: the registry reads the repository copy', async () => {
  const manifest = await read('package.json');
  expect(manifest.files).not.toContain('server.json');
});
