import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from '../cli';
import { createAssetRequirementsStore } from '../requirements-store';
import { createAssetRequirementsV1 } from '../contracts/requirements';

test('CLI rejects legacy category selection with migration guidance', () => {
  expect(() => parseArgs(['render', 'asset.js', '--category', 'prop'])).toThrow('removed');
  expect(parseArgs(['render', 'asset.js'])).not.toHaveProperty('category');
});

test('actual CLI saves and restores a host-bound source without dropping requirements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-cli-requirements-'));
  const cli = resolve(import.meta.dir, '../cli.ts');
  const requirements = createAssetRequirementsStore().host.bind(
    { taskId: 'class', lineageId: 'arena' },
    createAssetRequirementsV1({ labels: ['arena'] }),
    { actor: 'owner', reason: 'Test asset', source: 'brief' },
  );
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, cli, ...args], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_COLLECTIONS: JSON.stringify({ project: join(directory, 'assets') }),
        KILN_WORKSPACE: directory,
        KILN_PROGRAM_STORE: join(directory, 'programs'),
        KILN_BUILD_CACHE_DIR: join(directory, 'cache'),
      },
    });
  try {
    await writeFile(join(directory, 'requirements.json'), JSON.stringify(requirements));
    await writeFile(
      join(directory, 'asset.js'),
      "const meta={name:'Asset'};function build(){const r=createRoot('Asset');createPart('Body',boxGeo(1,1,1),gameMaterial('#777777'),{parent:r});return r;}",
    );
    const saved = run([
      'save',
      'asset.js',
      '--name',
      'Arena',
      '--render',
      'cpu',
      '--requirements',
      'requirements.json',
    ]);
    expect(saved.stderr.toString()).toBe('');
    expect(saved.exitCode).toBe(0);
    const result = JSON.parse(saved.stdout.toString()) as {
      asset: { assetId: string; revisionId: string };
    };
    const args = ['asset', result.asset.assetId, result.asset.revisionId, '--restore'];
    const neutral = run(args);
    expect(neutral.exitCode).toBe(1);
    expect(neutral.stderr.toString()).toContain('host binding');
    const authorized = run([...args, '--requirements', 'requirements.json']);
    expect(authorized.stderr.toString()).toBe('');
    expect(authorized.exitCode).toBe(0);
    expect(JSON.parse(authorized.stdout.toString())).toMatchObject({
      requirements: { binding: requirements },
      acceptance: 'reevaluation-required',
    });
    const rendered = run([
      'render',
      'asset.js',
      '--out',
      'asset.glb',
      '--render',
      'cpu',
      '--requirements',
      'requirements.json',
    ]);
    expect(rendered.stderr.toString()).toBe('');
    expect(rendered.exitCode).toBe(0);
    expect(rendered.stdout.toString()).toContain('requirements');
    await writeFile(join(directory, 'invalid.json'), JSON.stringify({ category: 'prop' }));
    const rejected = run([
      'render',
      'asset.js',
      '--render',
      'cpu',
      '--requirements',
      'invalid.json',
    ]);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr.toString()).toContain('migration');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
