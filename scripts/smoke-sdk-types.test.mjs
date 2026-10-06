import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { smokeSdkTypes } from './smoke-sdk-types.mjs';

async function fixture(run) {
  const temporary = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(join(temporary, 'kiln-sdk-types-')));
  if (!root.startsWith(temporary + sep)) throw new Error('Unsafe fixture path');
  try {
    await mkdir(join(root, 'lib'));
    const exports = {};
    for (const [name, file] of [
      ['.', 'core'],
      ['./arena', 'arena'],
      ['./agent', 'agent'],
      ['./composer/agent', 'composer'],
    ]) {
      exports[name] = { types: `./lib/${file}.d.ts`, import: `./lib/${file}.js` };
      await writeFile(join(root, `lib/${file}.d.ts`), 'export declare const present: boolean;\n');
    }
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '@instruktlabs/kiln', type: 'module', exports }),
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('core declarations include arena without requiring optional agent declarations', async () => {
  await fixture(async (root) => {
    await writeFile(
      join(root, 'lib/agent.d.ts'),
      "export { Missing } from 'missing-optional-peer';\n",
    );
    expect(await smokeSdkTypes(root)).toMatchObject({ entries: 2, status: 'passed' });
    await writeFile(
      join(root, 'lib/arena.d.ts'),
      "export { Missing } from 'missing-ranking-type';\n",
    );
    await expect(smokeSdkTypes(root)).rejects.toThrow();
  });
});

test('full declaration qualification cannot silently skip optional entrypoints', async () => {
  await fixture(async (root) => {
    expect(await smokeSdkTypes(root, { includeAgentPeers: true })).toMatchObject({
      entries: 4,
      status: 'passed',
    });
    await writeFile(
      join(root, 'lib/composer.d.ts'),
      "export { Missing } from 'missing-optional-peer';\n",
    );
    await expect(smokeSdkTypes(root, { includeAgentPeers: true })).rejects.toThrow();
  });
});
