import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportAssetGlb } from '../../src/asset-export';
import { hashBytes } from './mirror-core.mjs';
import { parseSwapList, sealArchive, swapPack } from './scene-pack-swap.mjs';

const OLD_A = 'r_' + 'a'.repeat(32), NEW_A = 'r_' + 'b'.repeat(32), OLD_C = 'r_' + 'c'.repeat(32);
const text = (value: string) => Buffer.from(value);
const json = (value: unknown) => text(`${JSON.stringify(value, null, 2)}\n`);

/** A small standalone: a sealed pack under assets/ plus a code chunk and the notices outside it. */
function fixture() {
  const sealed: Record<string, Buffer> = {
    'models/a.glb': text('glTF model a, first revision'),
    'models/c.glb': text('glTF model c'),
    'data/map.json': json({ a: { revision: OLD_A, sha256: hashBytes(text('glTF model a, first revision')) }, c: { revision: OLD_C } }),
  };
  const files = Object.entries(sealed).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hashBytes(bytes) }));
  const pack = { schema: 'kiln.scene-pack/1', id: 'demo', release: 'd1', three: '0.187.0', models: [{ id: 'a', path: 'models/a.glb' }, { id: 'c', path: 'models/c.glb' }], data: { map: 'data/map.json' }, files };
  const out = new Map<string, Buffer>();
  for (const [path, bytes] of Object.entries(sealed)) out.set(`assets/${path}`, bytes);
  out.set('assets/pack.json', json(pack));
  out.set('assets/SHA256SUMS', text(files.map(f => `${f.sha256}  ${f.path}\n`).join('')));
  out.set('assets/index-x1.js', text(`console.log("${OLD_A}")`));
  out.set('THIRD-PARTY-NOTICES.txt', text('notices\n'));
  return out;
}
const NEW_BYTES = text('glTF model a, flush-face fix');
const swapA = (bytes = NEW_BYTES) => ({ member: 'models/a.glb', bytes, revision: NEW_A, sha256: hashBytes(bytes), previous: { revision: OLD_A, sha256: hashBytes(text('glTF model a, first revision')) } });
/** The scene adapter for the fixture: rewrites the one data member that names model a. */
const regenerate = ({ files, swaps }: { files: Map<string, Buffer>; swaps: { revision: string; sha256: string }[] }) => {
  const map = JSON.parse(files.get('assets/data/map.json')!.toString('utf8'));
  map.a = { revision: swaps[0]!.revision, sha256: swaps[0]!.sha256 };
  return { members: { 'data/map.json': json(map) } };
};
const run = (overrides: Record<string, unknown> = {}) => swapPack({ files: fixture(), swaps: [swapA()], release: 'd2', usedReleases: ['d1'], regenerate, ...overrides });

describe('scene pack swap', () => {
  test('refuses a member the sealed pack does not hold', () => {
    expect(() => run({ swaps: [{ ...swapA(), member: 'models/missing.glb' }] })).toThrow(/not a sealed member/);
  });

  test('refuses a swap that changes nothing', () => {
    expect(() => run({ swaps: [swapA(text('glTF model a, first revision'))] })).toThrow(/changes nothing/);
  });

  test('refuses new bytes whose hash is not the declared one, and a pack member that is not the declared previous', () => {
    expect(() => run({ swaps: [{ ...swapA(), sha256: '0'.repeat(64) }] })).toThrow(/declared SHA-256/);
    expect(() => run({ swaps: [{ ...swapA(), previous: { revision: OLD_A, sha256: '0'.repeat(64) } }] })).toThrow(/previous pin/);
  });

  test('keeps every member it was not told to change byte for byte', () => {
    const { files, report } = run();
    const before = fixture();
    const changed = new Set(['assets/models/a.glb', 'assets/data/map.json', 'assets/pack.json', 'assets/SHA256SUMS']);
    for (const [path, bytes] of before) if (!changed.has(path)) expect(files.get(path)!.equals(bytes)).toBe(true);
    expect([...files.keys()].sort()).toEqual([...before.keys()].sort());
    expect(files.get('assets/models/a.glb')!.equals(NEW_BYTES)).toBe(true);
    expect(report.unchanged).toBe(before.size - changed.size);
    // The code chunk outside the pack still names the old revision: reported, not rewritten.
    expect(report.staleOutsidePack).toEqual([{ path: 'assets/index-x1.js', names: [OLD_A] }]);
  });

  test('recomputes every hash and size in pack.json and SHA256SUMS and names the new release', () => {
    const { files } = run();
    const pack = JSON.parse(files.get('assets/pack.json')!.toString('utf8'));
    expect(pack.release).toBe('d2');
    for (const file of pack.files) {
      const bytes = files.get(`assets/${file.path}`)!;
      expect(file).toEqual({ path: file.path, bytes: bytes.length, sha256: hashBytes(bytes) });
    }
    expect(files.get('assets/SHA256SUMS')!.toString('utf8')).toBe(pack.files.map((f: { sha256: string; path: string }) => `${f.sha256}  ${f.path}\n`).join(''));
    expect(files.get('assets/pack.json')!.toString('utf8')).toBe(`${JSON.stringify(pack, null, 2)}\n`);
  });

  test('is deterministic: the same inputs give the same archive bytes', () => {
    const one = sealArchive(run().files), two = sealArchive(run().files);
    expect(hashBytes(one)).toBe(hashBytes(two));
    expect(one.equals(two)).toBe(true);
  });

  test('refuses a release id that already exists', () => {
    expect(() => run({ release: 'd1' })).toThrow(/already/);
    expect(() => run({ release: 'd0', usedReleases: ['d1', 'd0'] })).toThrow(/already/);
  });

  test('refuses a pack member that still names a replaced revision or hash unless the adapter declares it history', () => {
    expect(() => run({ regenerate: () => ({ members: {} }) })).toThrow(/data\/map\.json.*still names/s);
    const kept = run({ regenerate: () => ({ members: {}, history: { 'data/map.json': 'fixture history' } }) });
    expect(kept.report.history).toEqual([{ path: 'data/map.json', reason: 'fixture history' }]);
  });

  test('reads a swap list as data and checks each file against its declared hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-swap-list-'));
    try {
      await writeFile(join(dir, 'a.glb'), NEW_BYTES);
      const list = { schema: 'kiln.scene-pack-swap/1', scene: 'demo', from: { release: 'd1' }, release: 'd2', swaps: [{ id: 'a', member: 'models/a.glb', file: 'a.glb', revision: NEW_A, sha256: hashBytes(NEW_BYTES), bytes: NEW_BYTES.length, previous: swapA().previous }] };
      const parsed = await parseSwapList(list, { inputs: dir });
      expect(parsed.swaps[0]!.bytes.equals(NEW_BYTES)).toBe(true);
      await expect(parseSwapList({ ...list, swaps: [{ ...list.swaps[0], sha256: '0'.repeat(64) }] }, { inputs: dir })).rejects.toThrow(/declared/);
      await expect(parseSwapList({ ...list, schema: 'other' }, { inputs: dir })).rejects.toThrow(/schema/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('derives the kiln runtime export of a saved revision, with its metadata sidecar under the declared name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kiln-swap-runtime-'));
    try {
      const glb = triangleGlb(), source = text("const meta={name:'Fixture'};function build(){return createRoot('Fixture');}"), preview = PNG;
      const files = { 'asset.glb': glb, 'source.kiln.js': source, 'preview.png': preview };
      const manifest = { version: 'kiln.asset.v1', assetId: 'a_' + 'f'.repeat(32), revisionId: NEW_A, parentRevision: OLD_A, name: 'Fixture', tags: [], createdAt: '2026-11-13T00:00:00.000Z', editable: true,
        files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: `sha256:${hashBytes(bytes)}` }])) };
      await mkdir(join(dir, 'child'));
      for (const [name, bytes] of Object.entries(files)) await writeFile(join(dir, 'child', name), bytes);
      await writeFile(join(dir, 'child/manifest.json'), JSON.stringify(manifest));
      const expected = await exportAssetGlb({ manifest, files } as never, { profile: 'runtime', metadataFileName: 'a-runtime.kiln-metadata.json' });
      if (expected.profile !== 'runtime') throw new Error('expected a runtime export');
      const entry = { id: 'a', member: 'models/a.glb', file: 'child/asset.glb', manifest: 'child/manifest.json', derive: 'kiln-runtime', runtimeMetadata: 'a-runtime.kiln-metadata.json',
        revision: NEW_A, parentRevision: OLD_A, sha256: hashBytes(expected.glb), bytes: expected.glb.length, previous: swapA().previous };
      const list = { schema: 'kiln.scene-pack-swap/1', scene: 'demo', from: { release: 'd1' }, release: 'd2', swaps: [entry] };
      const [swap] = (await parseSwapList(list, { inputs: dir })).swaps;
      expect(Buffer.from(swap!.bytes).equals(Buffer.from(expected.glb))).toBe(true);
      expect(swap!.runtimeMetadata).toEqual({ name: 'a-runtime.kiln-metadata.json', bytes: Buffer.from(expected.metadata.bytes) });
      // The default sidecar name follows the member, as `kiln export --out <member>` names it.
      const { runtimeMetadata: _, ...unnamed } = entry;
      const byMember = await exportAssetGlb({ manifest, files } as never, { profile: 'runtime', metadataFileName: 'a.kiln-metadata.json' });
      const [defaulted] = (await parseSwapList({ ...list, swaps: [{ ...unnamed, sha256: hashBytes(byMember.glb), bytes: byMember.glb.length }] }, { inputs: dir })).swaps;
      expect(defaulted!.runtimeMetadata.name).toBe('a.kiln-metadata.json');
      const { manifest: __, ...bare } = entry;
      await expect(parseSwapList({ ...list, swaps: [bare] }, { inputs: dir })).rejects.toThrow(/saved revision manifest/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzVkAAAAASUVORK5CYII=', 'base64');
/** A one-triangle GLB. */
function triangleGlb() {
  const bin = Buffer.alloc(44);
  for (const [i, v] of [0, 0, 0, 1, 0, 0, 0, 1, 0].entries()) bin.writeFloatLE(v, i * 4);
  for (let i = 0; i < 3; i++) bin.writeUInt16LE(i, 36 + i * 2);
  const document = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Fixture', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{}],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
    buffers: [{ byteLength: 44 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }] };
  const raw = Buffer.from(JSON.stringify(document)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
  raw.copy(json);
  const out = Buffer.alloc(28 + json.length + bin.length);
  out.write('glTF'); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(json.length, 12); out.write('JSON', 16);
  json.copy(out, 20); out.writeUInt32LE(bin.length, 20 + json.length); out.write('BIN\0', 24 + json.length); bin.copy(out, 28 + json.length);
  return out;
}
