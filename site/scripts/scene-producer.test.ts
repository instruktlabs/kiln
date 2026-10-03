import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProducerReceipt, producerEvidence } from './scene-producer.mjs';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
const modules = ['C:/old/scenes/node_modules/.bun/three@0.186.0/node_modules/three/build/three.core.js'];
const chunks = [{ file: 'assets/index-x.js', bytes: 24, sha256: 'a'.repeat(64) }];
const receipt = () => ({ schema: 'kiln.scene-producer/1', dependencies: { three: '0.186.0', react: null, 'react-dom': null, '@react-three/fiber': null } as Record<string, string | null>, build: { vite: '8.3.2', pluginReact: '6.0.3' }, chunks: structuredClone(chunks) });

describe('scene producer evidence', () => {
  test('historical modules identify the bundled version without borrowing installed tool versions', () => {
    expect(producerEvidence({ modules, chunks })).toEqual({ source: 'module-paths', dependencies: { three: '0.186.0', react: null, 'react-dom': null, '@react-three/fiber': null }, build: { vite: null, pluginReact: null } });
    expect(producerEvidence({ modules: ['/old/node_modules/three/build/three.core.js'], chunks }).dependencies.three).toBeNull();
  });

  test('a complete receipt binds exact chunks and carries producer tool versions', () => {
    expect(producerEvidence({ modules, chunks, producer: receipt() })).toMatchObject({ source: 'producer-receipt', dependencies: { three: '0.186.0' }, build: { vite: '8.3.2', pluginReact: '6.0.3' } });
  });

  test('rejects contradictory or invalid dependency versions instead of trusting a false receipt', () => {
    for (const version of ['0.186.1', '^0.186.0', null, '/home/private']) {
      const producer = receipt(); producer.dependencies.three = version;
      expect(() => producerEvidence({ modules, chunks, producer })).toThrow();
    }
    const producer = receipt(); producer.dependencies.react = '19.3.0';
    expect(() => producerEvidence({ modules, chunks, producer })).toThrow('react');
    const invalid = receipt(); invalid.build.vite = '^8.3.2';
    expect(() => producerEvidence({ modules, chunks, producer: invalid })).toThrow('vite');
    expect(() => producerEvidence({ modules, chunks, producer: { ...receipt(), schema: 'unknown' } })).toThrow('schema');
  });

  test('rejects changed, missing, extra, duplicated and unsafe chunks', () => {
    const cases = [[], [...chunks, chunks[0]], [{ ...chunks[0], file: '../index-x.js' }], [{ ...chunks[0], bytes: 25 }], [{ ...chunks[0], sha256: 'b'.repeat(64) }], [...chunks, { ...chunks[0], file: 'assets/extra.js' }]];
    for (const recorded of cases) expect(() => producerEvidence({ modules, chunks, producer: { ...receipt(), chunks: recorded } })).toThrow('chunk');
  });

  test('current producers read versions at the actual bundled module roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-producer-')); directories.push(root);
    const packageRoot = join(root, 'node_modules/three');
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'three', version: '0.186.1' }));
    const currentModules = [join(packageRoot, 'build/three.core.js')];
    const produced = createProducerReceipt({ modules: currentModules, chunks, build: { vite: '8.3.2', pluginReact: '6.0.3' } });
    expect(produced.dependencies.three).toBe('0.186.1');
    expect(producerEvidence({ modules: currentModules, chunks, producer: produced }).dependencies.three).toBe('0.186.1');
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'other', version: '0.186.1' }));
    expect(() => createProducerReceipt({ modules: currentModules, chunks, build: produced.build })).toThrow('three');
  });
});
