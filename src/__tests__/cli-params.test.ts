import { expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from '../cli';

const SOURCE = `const meta = { name: 'CliParams' };
const P = defineParams({
  width: { type: 'range', default: 1, min: 0.5, max: 2 },
  count: { type: 'int', default: 2, min: 1, max: 3 },
  style: { type: 'choice', default: 'plain', options: ['plain', '3', 'broken'] },
}, { presets: { wide: { width: 2 } } });
function build() {
  const root = createRoot('Root');
  if (P.style === 'broken') return undefined;
  for (let i = 0; i < P.count; i++)
    createPart('Box' + i, boxGeo(P.width, 1, 1), gameMaterial(0x808080), { parent: root, position: [i * 3, 0.5, 0] });
  return root;
}`;

it('parses --param values by their literal form, --preset and --sweep', () => {
  const args = parseArgs([
    'render',
    'a.js',
    '--param',
    'width=1.5',
    '--param',
    'lid=false',
    '--param',
    'paint=#8a5a33',
    '--param',
    'style="3"',
    '--param',
    'note=a=b',
    '--preset',
    'wide',
  ]);
  expect(args.params).toEqual({
    preset: 'wide',
    values: { width: 1.5, lid: false, paint: '#8a5a33', style: '3', note: 'a=b' },
  });
  expect(parseArgs(['render', 'a.js', '--sweep']).sweep).toBe(true);
  expect(parseArgs(['render', 'a.js']).params).toBeUndefined();
  expect(() => parseArgs(['render', 'a.js', '--param', 'width'])).toThrow('name=value');
  expect(() => parseArgs(['render', 'a.js', '--param', '=1'])).toThrow('name=value');
  expect(() => parseArgs(['render', 'a.js', '--sweep', '--param', 'width=1'])).toThrow('--sweep');
  expect(() => parseArgs(['render', 'a.js', '--sweep', '--out', 'x.glb'])).toThrow('--sweep');
});

// Measured 6.6 s on this host: one bundle and five CLI processes.
it('builds a variant, names a refused value and sweeps the range from the CLI', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-params-'));
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
    const run = (args: string[]) => {
      const result = Bun.spawnSync(['node', join(directory, 'cli.mjs'), ...args], {
        cwd: directory,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return { ...result, text: result.stdout.toString(), errors: result.stderr.toString() };
    };
    await writeFile(join(directory, 'source.js'), SOURCE);

    const base0 = run(['render', 'source.js', '--out', 'base.glb', '--json']);
    expect(base0.errors).toBe('');
    const baseReceipt = JSON.parse(base0.text);
    expect(baseReceipt).toMatchObject({
      ok: true,
      tris: 24,
      params: { values: { width: 1, count: 2 } },
    });

    const variant = run([
      'render',
      'source.js',
      '--out',
      'wide.glb',
      '--json',
      '--preset',
      'wide',
      '--param',
      'count=3',
      '--param',
      'style="3"',
    ]);
    expect(variant.errors).toBe('');
    const receipt = JSON.parse(variant.text);
    expect(receipt).toMatchObject({
      ok: true,
      tris: 36,
      params: { preset: 'wide', values: { width: 2, count: 3, style: '3' } },
    });
    expect(receipt.bounds.size[0]).toBeCloseTo(8, 5);
    expect(receipt.artifactGlbSha256).not.toBe(baseReceipt.artifactGlbSha256);

    const refused = run([
      'render',
      'source.js',
      '--out',
      'bad.glb',
      '--json',
      '--param',
      'width=9',
    ]);
    expect(refused.exitCode).toBe(1);
    const failure = JSON.parse(refused.text);
    expect(failure.ok).toBe(false);
    expect(failure.error).toContain('width takes 0.5 to 2');
    expect((await readdir(directory)).includes('bad.glb')).toBe(false);

    const sweep = run(['render', 'source.js', '--sweep', '--json']);
    expect(sweep.exitCode).toBe(1);
    const swept = JSON.parse(sweep.text);
    expect(swept.ok).toBe(true);
    expect(swept.sweep.points.map((point: { label: string }) => point.label)).toEqual([
      'defaults',
      'width=0.5',
      'width=2',
      'count=1',
      'count=3',
      'style=3',
      'style=broken',
      'preset wide',
    ]);
    expect(swept.sweep).toMatchObject({ built: 7, failed: 1, notSwept: [] });
    // Each size is listed as one the GLB could carry or one that needs a rebuild.
    expect(Object.keys(swept.sweep.shapes)).toEqual(['width', 'count']);
    for (const shape of Object.values(swept.sweep.shapes) as { mode: string }[])
      expect(['morph', 'rebuild']).toContain(shape.mode);
    expect(swept.files).toEqual([]);

    const table = run(['render', 'source.js', '--sweep']);
    expect(table.exitCode).toBe(1);
    expect(table.text).toContain('count=3');
    expect(table.text).toContain('36 tris');
    expect(table.text).toContain('style=broken  failed');
    expect(table.text).toMatch(/size width {2}(--carry-shapes would carry it|rebuild only)/);
    expect(table.text).toMatch(/size count {2}(--carry-shapes would carry it|rebuild only)/);
    expect((await readdir(directory)).includes('out.glb')).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
