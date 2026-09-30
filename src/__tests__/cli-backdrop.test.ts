import { expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BACKDROPS } from '../views/background';
import { decodePng } from '../views/png';
import { PAD } from '../views/grid';

it('paints the CLI contact sheet on the named backdrop, with or without a capture file', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-backdrop-'));
  try {
    const built = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: directory,
      naming: 'cli.mjs',
    });
    expect(built.success).toBe(true);
    const env = {
      ...process.env,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_WORKSPACE: directory,
      KILN_PROGRAM_STORE: join(directory, 'programs'),
      KILN_RENDER: 'cpu',
    };
    const run = (args: string[]) =>
      Bun.spawnSync(['node', join(directory, 'cli.mjs'), ...args], {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      });
    // The sheet's outer pixels are gutter, so read just inside the last cell's
    // top-right corner: away from the centred cube and from each cell's label.
    const corner = async (name: string): Promise<number[]> => {
      const png = decodePng(await readFile(join(directory, name)));
      const at = ((PAD + 1) * png.width + (png.width - PAD - 2)) * 3;
      return [...png.rgb.subarray(at, at + 3)];
    };
    await writeFile(
      join(directory, 'source.js'),
      "const meta={name:'BackdropFixture',category:'prop'};function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial(0x101010),{parent:root});return root;}",
    );
    // No --capture: the flag alone chooses the backdrop of the default six-view sheet.
    const light = run(['render', 'source.js', '--views', 'light.png', '--backdrop', 'light']);
    expect(light.stderr.toString()).toBe('');
    expect(light.exitCode).toBe(0);
    expect(await corner('light.png')).toEqual([...BACKDROPS.light.rgb]);
    const plain = run(['render', 'source.js', '--views', 'plain.png']);
    expect(plain.exitCode).toBe(0);
    expect(await corner('plain.png')).toEqual([...BACKDROPS.neutral.rgb]);
    // With --capture: the flag overrides the recipe's own backdrop, so a shared
    // recipe file can be re-run on another backdrop without editing it.
    await writeFile(
      join(directory, 'capture.json'),
      JSON.stringify({ preset: '1x1', backdrop: 'light' }),
    );
    const dark = run([
      'render',
      'source.js',
      '--views',
      'dark.png',
      '--capture',
      'capture.json',
      '--backdrop',
      'dark',
    ]);
    expect(dark.stderr.toString()).toBe('');
    expect(dark.exitCode).toBe(0);
    expect(await corner('dark.png')).toEqual([...BACKDROPS.dark.rgb]);
    const fromFile = run([
      'render',
      'source.js',
      '--views',
      'file.png',
      '--capture',
      'capture.json',
    ]);
    expect(fromFile.exitCode).toBe(0);
    expect(await corner('file.png')).toEqual([...BACKDROPS.light.rgb]);
    // Parsing is exercised through the spawned CLI, not in-process: importing
    // cli.ts here would instrument the whole file for coverage it cannot earn.
    const bad = run(['render', 'source.js', '--views', 'bad.png', '--backdrop', '#1a1a1a']);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr.toString()).toContain('neutral, dark, light');
    expect(await readdir(directory)).not.toContain('bad.png');
    const missing = run(['render', 'source.js', '--views', 'missing.png', '--backdrop']);
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('requires a value');
    // Without --views there is nothing for a backdrop to paint.
    const noViews = run(['render', 'source.js', '--backdrop', 'dark', '--out', 'x.glb']);
    expect(noViews.exitCode).not.toBe(0);
    expect(noViews.stderr.toString()).toContain('--backdrop requires --views');
    expect(await readdir(directory)).not.toContain('x.glb');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  // Three cold CLI spawns, each with a CPU render: 4.8 s locally under load.
}, 60_000);
