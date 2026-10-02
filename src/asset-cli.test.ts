import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    const again = run('first', ['export', asset.assetId, asset.revisionId, '--out', file]);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain(`${file} already exists and is never replaced`);
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
    const importedRun = run('second', ['import', file]);
    expect(importedRun.status).toBe(0);
    // Import names where the copy landed, so a surprising root is visible at once.
    const imported = JSON.parse(importedRun.stdout);
    const secondCollection = join(root, 'second', 'collection');
    expect(imported.collection).toBe('project');
    expect(imported.directory).toBe(secondCollection);
    expect(imported.assets).toHaveLength(1);
    expect(imported.assets[0]).toMatchObject({
      assetId: asset.assetId,
      revisionId: asset.revisionId,
      path: join(secondCollection, asset.assetId, 'revisions', asset.revisionId),
    });
    expect(await readdir(imported.assets[0].path)).toContain('manifest.json');
    const restored = run('second', ['asset', asset.assetId, asset.revisionId, '--restore']);
    expect(restored.status).toBe(0);
    expect(JSON.parse(restored.stdout).programRef).toMatch(/^p_/);
    expect(run('second', ['import', file]).status).toBe(0);
    // Commands that print JSON already accept --json and ignore it; view prints none.
    expect(JSON.parse(run('second', ['assets', '--json']).stdout).assets.length).toBe(1);
    const view = run('second', ['view', '--json']);
    expect(view.status).toBe(2);
    expect(view.stderr).toContain('service status|reprobe');
    const canonical = decodeAssetBundle(new Uint8Array(await readFile(file)))[0]!.files[
      'asset.glb'
    ]!;
    const editable = join(root, 'editable.glb');
    const sha256 = (bytes: Uint8Array) =>
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const editableRun = run('first', [
      'export',
      asset.assetId,
      asset.revisionId,
      '--out',
      editable,
      '--format',
      'glb',
      '--profile',
      'editable',
      '--json',
    ]);
    expect(editableRun.status).toBe(0);
    expect(JSON.parse(editableRun.stdout)).toEqual({
      ok: true,
      collection: 'project',
      assetId: asset.assetId,
      revisionId: asset.revisionId,
      profile: 'editable',
      format: 'glb',
      files: [{ kind: 'glb', path: editable, bytes: canonical.length, sha256: sha256(canonical) }],
    });
    expect(new Uint8Array(await readFile(editable))).toEqual(Uint8Array.from(canonical));
    const runtime = join(root, 'runtime.glb');
    const runtimeRun = run('first', [
      'export',
      asset.assetId,
      asset.revisionId,
      '--out',
      runtime,
      '--profile',
      'runtime',
      '--json',
    ]);
    expect(runtimeRun.status).toBe(0);
    const metadataPath = join(root, 'runtime.kiln-metadata.json');
    const receipt = JSON.parse(runtimeRun.stdout);
    expect(receipt).toMatchObject({ ok: true, profile: 'runtime', format: 'glb' });
    expect(receipt.files).toEqual(
      await Promise.all(
        [
          ['glb', runtime],
          ['metadata', metadataPath],
        ].map(async ([kind, path]) => {
          const bytes = new Uint8Array(await readFile(path!));
          return { kind, path, bytes: bytes.length, sha256: sha256(bytes) };
        }),
      ),
    );
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
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
}, 120_000); // Many compiled-CLI runs: 6.9 to 9.6 s in the gates of 2 October 2026, 18.9 s in a fresh clone's gate beside two live sessions, and past 30 s in the final gate's test step on a host at 97% CPU (10.7 s in that run's coverage step).

test('CLI collections name each directory, and add refuses a Windows root without a drive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-collections-cli-'));
  const env: Record<string, string | undefined> = {
    ...process.env,
    KILN_WORKSPACE: root,
    KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
    XDG_DATA_HOME: join(root, 'user-data'),
  };
  delete env.KILN_COLLECTIONS;
  const run = (args: string[]) =>
    spawnSync(process.execPath, [resolve('src/cli.ts'), ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
    });
  const listed = () => JSON.parse(run(['collections']).stdout).collections;
  try {
    expect(listed()).toEqual([
      { id: 'project', label: 'Workspace storage', directory: join(root, 'assets', 'kiln') },
      {
        id: 'library',
        label: 'User library storage',
        directory: join(root, 'user-data', 'kiln', 'library'),
      },
    ]);
    // A relative directory is the caller's: it resolves against the working directory.
    expect(run(['collections', 'add', 'game', 'game-assets']).status).toBe(0);
    expect(listed().at(-1)).toEqual({
      id: 'game',
      label: 'game',
      directory: join(root, 'game-assets'),
    });
    if (process.platform === 'win32') {
      const refused = run(['collections', 'add', 'shell', '/c/Users/example/kiln']);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('Collection shell directory "/c/Users/example/kiln"');
      expect(refused.stderr).toContain('Write it as C:/Users/example/kiln.');
      expect(listed().map((collection: { id: string }) => collection.id)).toEqual([
        'project',
        'library',
        'game',
      ]);
    }
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
