import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  canonicalizeProceduralTextureSpecV3,
  canonicalProceduralTextureJsonV3,
  hashProceduralTextureSpecV3,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
  type CanonicalProceduralTextureSpecV3,
} from '../procedural-texture-v3-contract';

const basic = { schemaVersion: 3, width: 4, height: 8, operations: [] };
describe('procedural texture V3 strict contract', () => {
  test('canonical defaults, order independence and compiler identity are explicit', () => {
    const explicit: CanonicalProceduralTextureSpecV3 = {
      operations: [],
      background: [0, 0, 0, 0],
      usage: 'albedo',
      height: 8,
      width: 4,
      schemaVersion: 3,
    };
    expect(canonicalizeProceduralTextureSpecV3(basic)).toEqual(explicit);
    expect(canonicalProceduralTextureJsonV3(basic)).toBe(
      canonicalProceduralTextureJsonV3(explicit),
    );
    expect(canonicalProceduralTextureJsonV3(basic)).toBe(
      '{"schemaVersion":3,"width":4,"height":8,"usage":"albedo","background":[0,0,0,0],"operations":[]}',
    );
    expect(hashProceduralTextureSpecV3(basic)).toBe(
      'sha256:e225132964d0c77bbcae5f05d85cfb70ef0b18b9eaa58fb38d1352f75f310ad5',
    );
    expect(hashProceduralTextureSpecV3(basic)).toBe(
      `sha256:${createHash('sha256')
        .update(`${PROCEDURAL_TEXTURE_V3_COMPILER_ID}\n${canonicalProceduralTextureJsonV3(basic)}`)
        .digest('hex')}`,
    );
    expect(
      canonicalizeProceduralTextureSpecV3({ ...basic, background: [99, 20, 30, 0] }).background,
    ).toEqual([0, 0, 0, 0]);
  });
  test('rejects unknown versions, unknown fields, nonfinite numbers and oversized work', () => {
    for (const input of [
      { ...basic, schemaVersion: 4 },
      { ...basic, callback: () => 1 },
      { ...basic, width: Infinity },
      { ...basic, width: 1025 },
      {
        ...basic,
        operations: Array(65).fill({
          op: 'paint',
          shape: { kind: 'rectangle', x: 0, y: 0, width: 4, height: 4 },
          rgba: [0, 0, 0, 255],
        }),
      },
    ]) {
      expect(() => canonicalizeProceduralTextureSpecV3(input)).toThrow();
    }
    const points = Array.from({ length: 64 }, (_, i) => [i % 2 ? 1024 : 0, i % 3 ? 1024 : 0]);
    expect(() =>
      canonicalizeProceduralTextureSpecV3({
        schemaVersion: 3,
        width: 1024,
        height: 1024,
        operations: [{ op: 'paint', shape: { kind: 'polygon', points }, rgba: [0, 0, 0, 255] }],
      }),
    ).toThrow(/work budget/);
  });
  test('rejects prototypes and accessors before any getter runs at every nested boundary', () => {
    let reads = 0;
    const getter = () => {
      reads++;
      return 3;
    };
    const inputs: unknown[] = [Object.create(basic), { ...basic, operations: Object.create([]) }];
    const root = { ...basic };
    Object.defineProperty(root, 'schemaVersion', { enumerable: true, get: getter });
    inputs.push(root);
    const rgba = [1, 2, 3, 255];
    Object.defineProperty(rgba, '0', { enumerable: true, get: getter });
    inputs.push({
      ...basic,
      operations: [
        { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 4, height: 4 }, rgba },
      ],
    });
    const operations: unknown[] = [];
    Object.defineProperty(operations, '0', { enumerable: true, get: getter });
    inputs.push({ ...basic, operations });
    inputs.push({
      ...basic,
      operations: [
        { op: 'paint', shape: Object.create({ kind: 'rectangle' }), rgba: [0, 0, 0, 255] },
      ],
    });
    for (const input of inputs) expect(() => canonicalizeProceduralTextureSpecV3(input)).toThrow();
    expect(reads).toBe(0);
  });
  test('palette and dither are color-only, stamps are bounded and nested V2 stays explicit', () => {
    for (const usage of ['normal', 'metallicRoughness', 'roughness', 'metalness', 'occlusion']) {
      expect(() =>
        canonicalizeProceduralTextureSpecV3({
          ...basic,
          usage,
          palette: { colors: [0, 0xffffff] },
        }),
      ).toThrow(/color usages/);
    }
    expect(() =>
      canonicalizeProceduralTextureSpecV3({ ...basic, palette: { colors: Array(33).fill(0) } }),
    ).toThrow();
    expect(() =>
      canonicalizeProceduralTextureSpecV3({
        ...basic,
        operations: [
          {
            op: 'stamps',
            shape: { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
            rgba: [255, 0, 0, 255],
            area: { x: 0, y: 0, width: 4, height: 8 },
            count: 29,
            seed: 1,
            periodic: true,
          },
        ],
      }),
    ).toThrow(/expanded stamps/);
    const legacy = {
      schemaVersion: 2,
      size: 4,
      layers: [{ op: 'noise', colorA: 0, colorB: 0xffffff }],
    };
    expect(() =>
      canonicalizeProceduralTextureSpecV3({
        ...basic,
        operations: [{ op: 'legacy-v2', spec: legacy }],
      }),
    ).toThrow(/dimensions/);
    expect(
      canonicalizeProceduralTextureSpecV3({
        ...basic,
        height: 4,
        operations: [{ op: 'legacy-v2', spec: legacy }],
      }).operations[0]?.op,
    ).toBe('legacy-v2');
  });
  test('all nested arrays reject holes, accessors, symbols, extra keys and inherited state without reads', () => {
    let reads = 0;
    const variants = (values: unknown[]) => {
      const accessor = values.slice();
      Object.defineProperty(accessor, '0', {
        enumerable: true,
        get: () => {
          reads++;
          return 0;
        },
      });
      const sparse = values.slice();
      delete sparse[0];
      const symbol = values.slice();
      Object.defineProperty(symbol, Symbol('bad'), { value: 1 });
      const extra = values.slice();
      Object.defineProperty(extra, 'extra', { value: 1, enumerable: true });
      const hidden = values.slice();
      Object.defineProperty(hidden, '0', { value: values[0], enumerable: false });
      const inherited = values.slice();
      Object.setPrototypeOf(inherited, {});
      return [accessor, sparse, symbol, extra, hidden, inherited];
    };
    const shape = { kind: 'rectangle', x: 0, y: 0, width: 4, height: 4 };
    const operation = { op: 'paint', shape, rgba: [1, 2, 3, 255] };
    for (const bad of variants([operation]))
      expect(() => canonicalizeProceduralTextureSpecV3({ ...basic, operations: bad })).toThrow();
    for (const bad of variants([1, 2, 3, 255]))
      expect(() =>
        canonicalizeProceduralTextureSpecV3({
          ...basic,
          operations: [{ ...operation, rgba: bad }],
        }),
      ).toThrow();
    for (const bad of variants([
      [0, 0],
      [4, 0],
      [0, 4],
    ]))
      expect(() =>
        canonicalizeProceduralTextureSpecV3({
          ...basic,
          operations: [{ ...operation, shape: { kind: 'polygon', points: bad } }],
        }),
      ).toThrow();
    for (const bad of variants([0, 0]))
      expect(() =>
        canonicalizeProceduralTextureSpecV3({
          ...basic,
          operations: [{ ...operation, shape: { kind: 'polygon', points: [bad, [4, 0], [0, 4]] } }],
        }),
      ).toThrow();
    for (const bad of variants([0, 0xffffff]))
      expect(() =>
        canonicalizeProceduralTextureSpecV3({ ...basic, palette: { colors: bad } }),
      ).toThrow();
    for (const bad of variants([{ op: 'solid', color: 0 }]))
      expect(() =>
        canonicalizeProceduralTextureSpecV3({
          ...basic,
          height: 4,
          operations: [{ op: 'legacy-v2', spec: { schemaVersion: 2, size: 4, layers: bad } }],
        }),
      ).toThrow();
    expect(reads).toBe(0);
  });
  test('strict V3 rejects missing/undefined version and invalid JSON scalar/channel values', () => {
    const { schemaVersion: _version, ...missing } = basic;
    for (const value of [
      missing,
      { ...basic, schemaVersion: undefined },
      { ...basic, usage: null },
      { ...basic, background: [0, 0, 0, 256] },
      { ...basic, background: [0, 0, 0, -1] },
      { ...basic, background: [0, 0, 0, NaN] },
      { ...basic, palette: { colors: [0], dither: 'random' } },
      {
        ...basic,
        operations: [
          {
            op: 'paint',
            shape: { kind: 'rectangle', x: 0.5, y: 0, width: 1, height: 1 },
            rgba: [0, 0, 0, 255],
          },
        ],
      },
      JSON.parse('{"schemaVersion":3,"width":4,"height":4,"operations":[],"__proto__":{}}'),
    ])
      expect(() => canonicalizeProceduralTextureSpecV3(value)).toThrow();
  });
});
