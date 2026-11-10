import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRigEngine } from './rig-render.mjs';

test('an explicitly selected installed engine records package provenance and loads its own compiled capture APIs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kiln-rig-package-'));
  try {
    await mkdir(join(dir, 'lib/views'), { recursive: true });
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/render-service-client.ts'), 'throw new Error("Published source must not replace compiled package APIs");');
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@instruktlabs/kiln', version: '1.1.0', type: 'module' }));
    await writeFile(join(dir, 'lib/render-service-client.js'), 'export const packageClient = true;');
    await writeFile(join(dir, 'lib/cli-render-mode.js'), 'export const packageMode = true;');
    await writeFile(join(dir, 'lib/views/camera.js'), 'export const packageCamera = true;');
    const engine = await loadRigEngine(dir);
    expect(engine.client.packageClient).toBe(true);
    expect(engine.mode.packageMode).toBe(true);
    expect(engine.camera.packageCamera).toBe(true);
    expect(engine.provenance).toMatchObject({ packageName: '@instruktlabs/kiln', packageVersion: '1.1.0' });
    expect(engine.provenance.packageJsonSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(engine.provenance).not.toHaveProperty('commit');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('refuses a different package even if it resembles a compiled engine', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kiln-rig-foreign-'));
  try {
    await mkdir(join(dir, 'lib'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'unrelated', version: '1' }));
    await writeFile(join(dir, 'lib/render-service-client.js'), '');
    await expect(loadRigEngine(dir)).rejects.toThrow('No compatible Kiln engine');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
