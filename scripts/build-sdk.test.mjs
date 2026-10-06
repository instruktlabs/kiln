import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSdk } from './build-sdk.mjs';

test('SDK output supports Node imports, dynamic imports and consumer declarations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-sdk-build-café-'));
  try {
    await mkdir(join(root, 'src/nested'), { recursive: true });
    await mkdir(join(root, 'src/evaluator'), { recursive: true });
    await mkdir(join(root, 'service'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        type: 'module',
        exports: { '.': './src/index.ts', './evaluator': './src/evaluator/index.ts' },
      }),
    );
    await writeFile(join(root, 'service/id.mjs'), 'export const protocol = "fixture-v1";\n');
    await writeFile(join(root, 'src/nested/index.ts'), 'export const value: number = 42;\n');
    await writeFile(join(root, 'src/lazy.ts'), 'export const label = "loaded";\n');
    await writeFile(join(root, 'src/evaluator/index.ts'), 'export const available = true;\n');
    for (const name of ['worker', 'probe-worker'])
      await writeFile(
        join(root, `src/evaluator/${name}.ts`),
        'import { value } from "../nested"; console.log(value);\n',
      );
    await writeFile(
      join(root, 'src/evaluator/transport-worker.mjs'),
      'console.log("transport");\n',
    );
    await writeFile(
      join(root, 'src/index.ts'),
      'export { value } from "./nested";\n' +
        'import { protocol } from "../service/id.mjs";\n' +
        'export const identity: typeof protocol = protocol;\n' +
        'export async function lazy() { return (await import("./lazy.ts")).label; }\n',
    );
    const result = await buildSdk(root);
    expect(result.entries).toEqual({
      '.': { types: './lib/index.d.ts', import: './lib/index.js' },
      './evaluator': { types: './lib/evaluator/index.d.ts', import: './lib/evaluator/index.js' },
    });
    // These entry files are opened by URL at runtime, not by TS import edges.
    for (const [worker, value] of [
      ['worker.js', '42'],
      ['probe-worker.js', '42'],
      ['transport-worker.mjs', 'transport'],
    ])
      expect(
        execFileSync('node', [join(root, 'lib/evaluator', worker)], {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(value);
    const output = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        'import {value, identity, lazy} from "./lib/index.js"; console.log(JSON.stringify([value, identity, await lazy()]));',
      ],
      { cwd: root, encoding: 'utf8', windowsHide: true },
    );
    expect(JSON.parse(output)).toEqual([42, 'fixture-v1', 'loaded']);
    expect(await readFile(join(root, 'lib/index.d.ts'), 'utf8')).toContain('./nested/index.js');
    await writeFile(
      join(root, 'consumer.ts'),
      'import { value, identity, lazy } from "./lib/index.js";\n' +
        'const number: number = value; const id: "fixture-v1" = identity;\n' +
        'const result: Promise<string> = lazy(); void [number, id, result];\n',
    );
    execFileSync(
      'node',
      [
        fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
        '--noEmit',
        '--strict',
        '--module',
        'NodeNext',
        '--target',
        'ES2022',
        'consumer.ts',
      ],
      { cwd: root, encoding: 'utf8', windowsHide: true },
    );
    await writeFile(join(root, 'lib/stale.js'), 'throw new Error("obsolete output");');
    await buildSdk(root);
    expect(existsSync(join(root, 'lib/stale.js'))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
