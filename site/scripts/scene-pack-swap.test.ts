import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
