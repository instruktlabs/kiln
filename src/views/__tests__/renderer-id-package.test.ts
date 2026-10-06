import { expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

it('reads its own package version when bundled rather than the consuming application version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-renderer-package-'));
  try {
    const pkg = join(root, 'engine');
    await mkdir(join(pkg, 'dist'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'consumer', version: '999.0.0' }),
    );
    await writeFile(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@instruktlabs/kiln', version: '1.2.3-test' }),
    );
    const target = join(pkg, 'dist/renderer.mjs');
    const built = spawnSync(
      process.execPath,
      ['build', 'src/views/renderer-id.ts', '--target=node', `--outfile=${target}`],
      { cwd: resolve(import.meta.dir, '../../..'), encoding: 'utf8' },
    );
    expect(built.status).toBe(0);
    const run = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `console.log((await import(${JSON.stringify(pathToFileURL(target).href)})).CPU_RASTER_RENDERER_ID)`,
      ],
      { encoding: 'utf8' },
    );
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe('cpu-raster:1.2.3-test');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
