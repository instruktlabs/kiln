import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionBoundary } from './build-boundary.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const archive = process.argv[2];
if (!archive)
  throw new Error(
    'Usage: node hosting/scripts/prepare-native-host.mjs <qualified.tgz> [cache-directory]',
  );
const output = resolve(process.argv[3] ?? join(root, '.cache/native-host-image/context'));
if (!output.startsWith(join(root, '.cache') + sep))
  throw new Error('Build context must be within this checkout cache');
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Build context must be empty');
const published = JSON.parse(
  await readFile(join(root, '.github/published-candidate.json'), 'utf8'),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(
  hash(await readFile(archive)),
  published.sha256,
  'Use the exact public release archive',
);
const files = {};
for (const name of ['native-mcp', 'native-host']) {
  const base = join(root, '.cache/hosted-worker');
  const identity = JSON.parse(await readFile(join(base, `${name}-build.json`), 'utf8'));
  const bytes = await readFile(join(base, `${name}.mjs`));
  assert.equal(hash(bytes), identity.sha256);
  assertProductionBoundary(name, identity.inputs);
  await writeFile(join(output, `${name}.mjs`), bytes);
  files[`${name}.mjs`] = identity.sha256;
}
for (const [source, destination] of [
  ['Dockerfile.host', 'Dockerfile'],
  ['serve.mjs', 'serve.mjs'],
]) {
  const path = join(root, 'hosting/container', source);
  await copyFile(path, join(output, destination));
  files[destination] = hash(await readFile(path));
}
await copyFile(archive, join(output, 'candidate.tgz'));
await writeFile(join(output, 'candidate.sha256'), `${published.sha256}  candidate.tgz\n`);
const dependencies = JSON.parse(
  await readFile(join(root, 'hosting/package.json'), 'utf8'),
).dependencies;
await writeFile(
  join(output, 'package.json'),
  `${JSON.stringify(
    {
      name: 'kiln-private-native-host',
      version: published.version,
      private: true,
      type: 'module',
      dependencies: {
        '@instruktlabs/kiln': 'file:./candidate.tgz',
        '@modelcontextprotocol/node': dependencies['@modelcontextprotocol/node'],
        '@modelcontextprotocol/server': dependencies['@modelcontextprotocol/server'],
      },
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  join(dirname(output), 'context-receipt.json'),
  `${JSON.stringify(
    {
      output,
      engine: published,
      files,
      next: 'Generate package-lock.json in this context, then build Dockerfile for linux/amd64. Retain the resulting immutable image and inventories.',
    },
    null,
    2,
  )}\n`,
);
console.log(`Prepared minimal native host context: ${output}`);
