import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAllRuntime, runtimeBuildIdentity } from './build-runtime.mjs';

test('one full build uses the regenerated manifest identity for every runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-manifest-build-'));
  try {
    const { bun } = JSON.parse(
      await readFile(new URL('../toolchain.json', import.meta.url), 'utf8'),
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ version: '1.2.1', packageManager: `bun@${bun}` }),
    );
    await writeFile(join(root, 'bun.lock'), '{}');
    for (const dir of [
      'scripts',
      'src/generated',
      'src/evaluator',
      'src/agent',
      'render-service/src',
    ])
      await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, 'src/generated/mcp-manifest.json'), '{"revision":"stale"}');
    await writeFile(
      join(root, 'scripts/generate-mcp-manifest.ts'),
      "await Bun.write('src/generated/mcp-manifest.json', JSON.stringify({revision:'current'}));",
    );
    for (const name of [
      'cli.ts',
      'mcp-server.ts',
      'mcp-engine.ts',
      'evaluator/worker.ts',
      'agent/run.ts',
      'agent/providers.ts',
    ])
      await writeFile(join(root, 'src', name), 'export const fixture = true;');
    const entries = await buildAllRuntime(root);
    const current = await runtimeBuildIdentity(root);
    expect(new Set(entries.map((entry) => entry.identity))).toEqual(new Set([current.identity]));
    expect(
      JSON.parse(await readFile(join(root, 'src/generated/mcp-manifest.json'), 'utf8')).revision,
    ).toBe('current');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
