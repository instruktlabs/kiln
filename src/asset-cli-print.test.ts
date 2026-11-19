import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { boxGeo, gameMaterial, planeGeo } from './primitives';
import { renderSceneToGLB } from './render';

test('kiln export --format stl|3mf writes millimetre print files and refuses open meshes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-print-cli-'));
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
  const importGlb = async (name: string, scene: THREE.Object3D) => {
    const file = join(root, `${name}.glb`);
    await writeFile(file, (await renderSceneToGLB(scene)).bytes);
    const imported = run(['import', file]);
    expect(imported.status).toBe(0);
    return JSON.parse(imported.stdout).assets[0] as { assetId: string; revisionId: string };
  };
  try {
    const solid = new THREE.Group();
    const block = new THREE.Mesh(boxGeo(0.1, 0.02, 0.05), gameMaterial(0x336699));
    block.name = 'Block';
    solid.add(block);
    const closed = await importGlb('closed', solid);

    const stl = join(root, 'block.stl');
    const written = run([
      'export',
      closed.assetId,
      closed.revisionId,
      '--format',
      'stl',
      '--out',
      stl,
      '--json',
    ]);
    expect(written.stderr).toBe('');
    expect(written.status).toBe(0);
    const receipt = JSON.parse(written.stdout);
    expect(receipt).toMatchObject({
      ok: true,
      format: 'stl',
      print: {
        unit: 'millimeter',
        up: 'z',
        triangles: 12,
        bounds: { min: [-50, -25, -10], max: [50, 25, 10] },
      },
    });
    expect(receipt.print.volumeMm3).toBeCloseTo(100 * 20 * 50, 1);
    expect(receipt.files).toHaveLength(1);
    expect((await readFile(stl)).byteLength).toBe(84 + 50 * 12);

    const model = join(root, 'block.3mf');
    expect(
      run(['export', closed.assetId, closed.revisionId, '--format', '3mf', '--out', model]).status,
    ).toBe(0);
    expect((await readFile(model)).subarray(0, 2).toString()).toBe('PK');

    // Extension and option mismatches are refused before anything is written.
    const wrong = run([
      'export',
      closed.assetId,
      closed.revisionId,
      '--format',
      'stl',
      '--out',
      join(root, 'block.3mf.txt'),
    ]);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('.stl');
    const runtime = run([
      'export',
      closed.assetId,
      closed.revisionId,
      '--format',
      '3mf',
      '--profile',
      'runtime',
      '--out',
      join(root, 'runtime.3mf'),
    ]);
    expect(runtime.status).toBe(1);
    expect(runtime.stderr).toContain('editable');
    expect(existsSync(join(root, 'runtime.3mf'))).toBe(false);

    const open = new THREE.Group();
    const floor = new THREE.Mesh(planeGeo(1, 1), gameMaterial(0x888888));
    floor.name = 'Floor';
    open.add(floor);
    const leaky = await importGlb('open', open);
    const refused = run([
      'export',
      leaky.assetId,
      leaky.revisionId,
      '--format',
      'stl',
      '--out',
      join(root, 'floor.stl'),
    ]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('Floor');
    expect(refused.stderr).toContain('not closed');
    expect(existsSync(join(root, 'floor.stl'))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000); // Five CLI spawns; a cold Windows spawn measured 4-6 s each on 2026-11-18.
