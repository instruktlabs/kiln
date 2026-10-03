import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleModuleManifest } from '../../src/build';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });

test('standalone builds emit exact producer versions and byte-bound chunks beside their modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-scene-producer-')); directories.push(root);
  const packageRoot = join(root, 'node_modules/three');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'three', version: '0.186.1' }));
  const module = join(packageRoot, 'build/three.core.js');
  const code = 'export const label = "scène";\n';
  const emitted: any[] = [];
  const plugin = bundleModuleManifest();
  const hook: any = plugin.generateBundle;
  const generate = typeof hook === 'function' ? hook : hook.handler;
  generate.call({ emitFile: (file: unknown) => emitted.push(file) }, {}, { 'assets/index-a.js': { type: 'chunk', fileName: 'assets/index-a.js', code, modules: { [module]: {} } } });
  expect(emitted).toHaveLength(1);
  const record = JSON.parse(emitted[0].source);
  expect(record.modules).toEqual([module]);
  expect(record.producer).toMatchObject({ schema: 'kiln.scene-producer/1', dependencies: { three: '0.186.1', react: null, 'react-dom': null, '@react-three/fiber': null }, chunks: [{ file: 'assets/index-a.js', bytes: Buffer.byteLength(code), sha256: createHash('sha256').update(code).digest('hex') }] });
  expect(record.producer.build.vite).toMatch(/^\d+\.\d+\.\d+$/);
  expect(record.producer.build.pluginReact).toMatch(/^\d+\.\d+\.\d+$/);
  expect(JSON.stringify(record.producer)).not.toContain(root);
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'wrong', version: '0.186.1' }));
  expect(() => generate.call({ emitFile: () => {} }, {}, { 'assets/index-a.js': { type: 'chunk', fileName: 'assets/index-a.js', code, modules: { [module]: {} } } })).toThrow('three');
});
