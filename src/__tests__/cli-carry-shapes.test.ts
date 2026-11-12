import { expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SHELF = `const meta = { name: 'Shelf' };
const P = defineParams({
  width: { type: 'range', default: 1.0, min: 0.6, max: 1.6, unit: 'm' },
  bays: { type: 'int', default: 2, min: 1, max: 4 },
});
function build() {
  const root = createRoot('Shelf');
  const wood = gameMaterial(0x8a5a33);
  createPart('Board', boxGeo(0.3, 0.04, P.width), wood, { parent: root, position: [0, 0.52, 0] });
  createPart('Left', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, -P.width / 2 + 0.02] });
  createPart('Right', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, P.width / 2 - 0.02] });
  for (let i = 1; i < P.bays; i++)
    createPart('Divider' + i, boxGeo(0.28, 0.5, 0.02), wood, { parent: root, position: [0, 0.25, -P.width / 2 + (P.width * i) / P.bays] });
  return root;
}`;

/**
 * `kiln export --carry-shapes` rebuilds the saved source of one revision and writes the sizes
 * it can as morph targets. The flag is the only way in from the CLI, so it is driven here as
 * a process: save, export, read the sidecar, and the three ways it refuses.
 *
 * Budget: six CLI processes, measured 8 s on Windows on 2026-11-12 with other builds running.
 */
it('kiln export --carry-shapes writes carried sizes and refuses a derived file', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-carry-shapes-'));
  const cli = resolve(import.meta.dir, '../cli.ts');
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, cli, ...args], {
      cwd: directory,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_LIVE_REVIEW: 'off',
        KILN_PROGRAM_STORE: join(directory, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(directory, 'collection') }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  try {
    const source = join(directory, 'shelf.kiln.js');
    await writeFile(source, SHELF);
    const saved = run(['save', source, '--name', 'Shelf', '--render', 'cpu']);
    expect(saved.stderr.toString()).toBe('');
    expect(saved.exitCode).toBe(0);
    const asset = JSON.parse(saved.stdout.toString()).asset;
    const revision = [asset.assetId, asset.revisionId];
    const runtime = ['--format', 'glb', '--profile', 'runtime'];

    const out = join(directory, 'out', 'shelf.glb');
    const carried = run(['export', ...revision, ...runtime, '--carry-shapes', '--out', out]);
    expect(carried.stderr.toString()).toBe('');
    expect(carried.exitCode).toBe(0);
    const metadata = JSON.parse(
      await readFile(join(directory, 'out', 'shelf.kiln-metadata.json'), 'utf8'),
    );
    expect(metadata.params.shapes.width).toMatchObject({
      mode: 'morph',
      clip: 'kiln.param.width',
    });
    expect(metadata.params.shapes.bays).toMatchObject({
      mode: 'rebuild',
      reason: 'STRUCTURE_CHANGED',
    });
    const glb = await readFile(out);
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    expect(json.animations.map((clip: { name: string }) => clip.name)).toEqual([
      'kiln.param.width',
    ]);

    // Without the flag the same revision exports with no sizes and no clip.
    const plain = join(directory, 'out', 'plain.glb');
    expect(run(['export', ...revision, ...runtime, '--out', plain]).exitCode).toBe(0);
    const plainMetadata = JSON.parse(
      await readFile(join(directory, 'out', 'plain.kiln-metadata.json'), 'utf8'),
    );
    expect(plainMetadata.params?.shapes).toBeUndefined();

    for (const extra of [
      ['--target', 'three'],
      ['--draws', 'minimal'],
    ]) {
      const refused = run([
        'export',
        ...revision,
        ...runtime,
        ...extra,
        '--carry-shapes',
        '--out',
        join(directory, 'out', 'refused.glb'),
      ]);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr.toString()).toContain(
        '--carry-shapes requires --profile runtime without --target or --draws',
      );
    }
    const editable = run([
      'export',
      ...revision,
      '--format',
      'glb',
      '--carry-shapes',
      '--out',
      join(directory, 'out', 'editable.glb'),
    ]);
    expect(editable.exitCode).not.toBe(0);
    expect(editable.stderr.toString()).toContain('--carry-shapes requires --profile runtime');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
