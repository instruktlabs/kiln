import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { decodeAssetBundle } from './assets';
import { BACKDROPS } from './views/background';
import { PAD } from './views/grid';
import { decodePng } from './views/png';

test('CLI saves, exports, imports, and restores a revision across independent stores', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-asset-cli-'));
  const cli = resolve('src/cli.ts');
  const run = (workspace: string, args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_PROGRAM_STORE: join(root, workspace, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(root, workspace, 'collection') }),
      },
      encoding: 'utf8',
      windowsHide: true,
    });
  try {
    const saved = run('first', [
      'save',
      resolve('examples/crate.kiln.js'),
      '--name',
      'Crate',
      '--model',
      'example-model',
      '--harness',
      'example-harness',
      '--author',
      'Original author',
      '--render',
      'cpu',
    ]);
    expect(saved.status).toBe(0);
    // Name the failure. A `save` that exits 0 with empty stdout is the silent
    // early-exit this suite mistook for flakiness for weeks; assert the output
    // exists before parsing, so a regression reports the command rather than a
    // JSON syntax error several frames away from the cause.
    expect(saved.stdout.length).toBeGreaterThan(0);
    const asset = JSON.parse(saved.stdout).asset;
    const file = join(root, 'crate.zip');
    expect(run('first', ['export', asset.assetId, asset.revisionId, '--out', file]).status).toBe(0);
    expect(run('first', ['export', asset.assetId, asset.revisionId, '--out', file]).status).toBe(1);
    expect(decodeAssetBundle(new Uint8Array(await readFile(file)))[0]!.manifest.revisionId).toBe(
      asset.revisionId,
    );
    expect(
      decodeAssetBundle(new Uint8Array(await readFile(file)))[0]!.manifest.attribution,
    ).toEqual({
      model: 'example-model',
      harness: 'example-harness',
      author: 'Original author',
    });
    expect(run('second', ['import', file]).status).toBe(0);
    const restored = run('second', ['asset', asset.assetId, asset.revisionId, '--restore']);
    expect(restored.status).toBe(0);
    expect(JSON.parse(restored.stdout).programRef).toMatch(/^p_/);
    expect(run('second', ['import', file]).status).toBe(0);
    expect(JSON.parse(run('second', ['assets']).stdout).assets.length).toBe(1);
    const canonical = decodeAssetBundle(new Uint8Array(await readFile(file)))[0]!.files[
      'asset.glb'
    ]!;
    const editable = join(root, 'editable.glb');
    expect(
      run('first', [
        'export',
        asset.assetId,
        asset.revisionId,
        '--out',
        editable,
        '--format',
        'glb',
        '--profile',
        'editable',
      ]).status,
    ).toBe(0);
    expect(new Uint8Array(await readFile(editable))).toEqual(Uint8Array.from(canonical));
    const runtime = join(root, 'runtime.glb');
    expect(
      run('first', [
        'export',
        asset.assetId,
        asset.revisionId,
        '--out',
        runtime,
        '--profile',
        'runtime',
      ]).status,
    ).toBe(0);
    const metadata = JSON.parse(await readFile(join(root, 'runtime.kiln-metadata.json'), 'utf8'));
    expect(metadata.version).toBe('kiln.runtime-metadata.v1');
    expect(metadata.source.revisionId).toBe(asset.revisionId);
    const runtimeBefore = await readFile(runtime);
    expect(
      run('first', [
        'export',
        asset.assetId,
        asset.revisionId,
        '--out',
        runtime,
        '--profile',
        'runtime',
      ]).status,
    ).toBe(1);
    expect(await readFile(runtime)).toEqual(runtimeBefore);
    for (const flags of [
      ['--profile', 'unknown'],
      ['--profile', 'runtime', '--format', 'bundle'],
      ['--profile', 'runtime', '--format', 'source'],
    ]) {
      expect(
        run('first', [
          'export',
          asset.assetId,
          asset.revisionId,
          '--out',
          join(root, 'bad.glb'),
          ...flags,
        ]).status,
      ).toBe(1);
    }
    expect(await readdir(root)).not.toContain('bad.glb');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test('CLI save paints its preview on the named backdrop and records it, like kiln_save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-asset-cli-backdrop-'));
  const cli = resolve('src/cli.ts');
  const run = (args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(root, 'collection') }),
      },
      encoding: 'utf8',
      windowsHide: true,
    });
  try {
    const saved = run([
      'save',
      resolve('examples/crate.kiln.js'),
      '--name',
      'Crate',
      '--render',
      'cpu',
      '--backdrop',
      'dark',
    ]);
    expect(saved.status).toBe(0);
    expect(saved.stdout.length).toBeGreaterThan(0);
    const asset = JSON.parse(saved.stdout).asset;
    const file = join(root, 'crate.zip');
    expect(run(['export', asset.assetId, asset.revisionId, '--out', file]).status).toBe(0);
    const [entry] = decodeAssetBundle(new Uint8Array(await readFile(file)));
    expect(entry!.manifest.preview?.backdrop).toBe('dark');
    const png = decodePng(entry!.files['preview.png']!);
    // A corner inside the sheet's padding is backdrop, whatever the asset is.
    const at = ((PAD + 1) * png.width + (png.width - PAD - 2)) * 3;
    expect([...png.rgb.subarray(at, at + 3)]).toEqual([...BACKDROPS.dark.rgb]);

    // A free colour is refused by the same validation the tool applies.
    const free = run([
      'save',
      resolve('examples/crate.kiln.js'),
      '--name',
      'Crate',
      '--backdrop',
      '#000000',
    ]);
    expect(free.status).not.toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
