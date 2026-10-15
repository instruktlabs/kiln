/**
 * Atlas packer (delivery contract item 5).
 *
 * `textureAtlas` accepts regions without `content` when the atlas sets
 * `pack: { edge: 1024 | 2048, gutter?, algorithm?: 'maxrects' }`. Placement is deterministic
 * (allocation area descending, then name), explicit rectangles stay where they are, packed
 * specs carry compiler id `kiln.texture-atlas.v1.2` with raised limits, and the canonical spec
 * records every resolved placement so a saved record re-validates without re-packing.
 */
import { describe, expect, test } from 'bun:test';
import {
  canonicalizeTextureAtlasSpecV1,
  hashTextureAtlasSpecV1,
  TEXTURE_ATLAS_COMPILER_ID,
  TEXTURE_ATLAS_COMPILER_ID_V1_2,
  TEXTURE_ATLAS_LIMITS_V1_2,
  textureAtlasCompilerIdV1,
  validateTextureAtlasManifestV1,
} from '../texture-atlas-contract';
import { compileTextureAtlasSpecV1 } from '../texture-atlas-pixels';
import { remapUVToAtlas, textureAtlas } from '../texture-atlas';
import { readAtlasTextureProvenance } from '../atlas-provenance';
import * as THREE from 'three';

const procedural = (size: number, rgba: [number, number, number, number]) => ({
  kind: 'procedural' as const,
  spec: { schemaVersion: 3, width: size, height: size, background: rgba, operations: [] },
});
const packed = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  usage: 'albedo',
  pack: { edge: 1024 },
  regions: [
    { name: 'small', source: procedural(64, [10, 20, 30, 255]) },
    { name: 'large', source: procedural(256, [200, 100, 50, 255]) },
    { name: 'medium-b', source: procedural(128, [0, 255, 0, 255]) },
    { name: 'medium-a', source: procedural(128, [0, 0, 255, 255]) },
  ],
  ...extra,
});

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('atlas packer', () => {
  test('packs regions without content deterministically by area, then name', () => {
    const spec = canonicalizeTextureAtlasSpecV1(packed());
    expect(spec.width).toBe(1024);
    expect(spec.height).toBe(1024);
    expect(spec.pack).toEqual({ edge: 1024, gutter: 2, algorithm: 'maxrects' });
    const byName = Object.fromEntries(spec.regions.map((r) => [r.name, r]));
    // The largest allocation goes first, at the origin, inset by its gutter.
    expect(byName.large!.content).toEqual({ x: 2, y: 2, width: 256, height: 256 });
    expect(byName.large!.packed).toBe(true);
    // Equal areas place in name order.
    const a = byName['medium-a']!.content,
      b = byName['medium-b']!.content;
    expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true);
    for (const r of spec.regions)
      expect(r.content.width).toBe(r.source.kind === 'procedural' ? r.source.spec.width : 0);
    const allocations = spec.regions.map((r) => ({
      x: r.content.x - r.gutter,
      y: r.content.y - r.gutter,
      width: r.content.width + 2 * r.gutter,
      height: r.content.height + 2 * r.gutter,
    }));
    for (let i = 0; i < allocations.length; i++)
      for (let j = i + 1; j < allocations.length; j++)
        expect(overlaps(allocations[i]!, allocations[j]!)).toBe(false);
    // Input order does not change the placement.
    const shuffled = packed();
    shuffled.regions.reverse();
    expect(canonicalizeTextureAtlasSpecV1(shuffled)).toEqual(spec);
    // The canonical record re-validates as-is: nothing re-packs.
    expect(canonicalizeTextureAtlasSpecV1(spec)).toEqual(spec);
  });

  test('explicit rectangles stay fixed and packed regions avoid them', () => {
    const spec = canonicalizeTextureAtlasSpecV1(
      packed({
        regions: [
          {
            name: 'fixed',
            content: { x: 4, y: 4, width: 256, height: 256 },
            gutter: 4,
            source: procedural(256, [1, 2, 3, 255]),
          },
          { name: 'free', source: procedural(256, [9, 9, 9, 255]) },
        ],
      }),
    );
    const fixed = spec.regions.find((r) => r.name === 'fixed')!;
    const free = spec.regions.find((r) => r.name === 'free')!;
    expect(fixed.content).toEqual({ x: 4, y: 4, width: 256, height: 256 });
    expect(fixed.packed).toBeUndefined();
    expect(free.packed).toBe(true);
    expect(free.gutter).toBe(2);
    expect(
      overlaps(
        { x: 0, y: 0, width: 264, height: 264 },
        { x: free.content.x - 2, y: free.content.y - 2, width: 260, height: 260 },
      ),
    ).toBe(false);
  });

  test('pack gutter is the default per region and a region gutter overrides it', () => {
    const spec = canonicalizeTextureAtlasSpecV1(
      packed({
        pack: { edge: 1024, gutter: 8, algorithm: 'maxrects' },
        regions: [
          { name: 'a', source: procedural(32, [1, 1, 1, 255]) },
          { name: 'b', gutter: 0, source: procedural(32, [2, 2, 2, 255]) },
        ],
      }),
    );
    expect(spec.regions.map((r) => r.gutter)).toEqual([8, 0]);
    expect(spec.regions[0]!.content).toMatchObject({ x: 8, y: 8 });
  });

  test('packed specs use compiler v1.2 limits; unpacked specs keep v1.1 identities', () => {
    expect(TEXTURE_ATLAS_COMPILER_ID).toBe('kiln.texture-atlas.v1.1');
    expect(TEXTURE_ATLAS_COMPILER_ID_V1_2).toBe('kiln.texture-atlas.v1.2');
    expect(TEXTURE_ATLAS_LIMITS_V1_2).toMatchObject({
      edge: 2048,
      outputTexels: 4_194_304,
      sources: 32,
      regions: 128,
    });
    const big = canonicalizeTextureAtlasSpecV1(packed({ pack: { edge: 2048 } }));
    expect([big.width, big.height]).toEqual([2048, 2048]);
    expect(textureAtlasCompilerIdV1(big)).toBe('kiln.texture-atlas.v1.2');
    const explicit = {
      schemaVersion: 1,
      width: 64,
      height: 64,
      usage: 'albedo',
      regions: [
        {
          name: 'one',
          content: { x: 2, y: 2, width: 8, height: 8 },
          source: procedural(8, [5, 5, 5, 255]),
        },
      ],
    };
    const canonical = canonicalizeTextureAtlasSpecV1(explicit);
    expect(textureAtlasCompilerIdV1(canonical)).toBe('kiln.texture-atlas.v1.1');
    expect('pack' in canonical).toBe(false);
    expect('packed' in canonical.regions[0]!).toBe(false);
    // Unpacked atlases still stop at the v1.1 edge; packed ones may name up to 128 regions.
    expect(() => canonicalizeTextureAtlasSpecV1({ ...explicit, width: 2048 })).toThrow(/width/);
    const many = Array.from({ length: 100 }, (_, i) => ({
      name: `r${String(i).padStart(3, '0')}`,
      source: procedural(16, [i % 30, 0, 0, 255]),
    }));
    expect(canonicalizeTextureAtlasSpecV1(packed({ regions: many })).regions).toHaveLength(100);
    expect(() =>
      canonicalizeTextureAtlasSpecV1({
        ...explicit,
        regions: many.map((r, i) => ({
          ...r,
          content: { x: (i % 8) * 20 + 2, y: Math.floor(i / 8) * 20 + 2, width: 16, height: 16 },
        })),
      }),
    ).toThrow();
  });

  test('a packed region without a known size, an overfull pack and a bad edge fail closed', () => {
    expect(() =>
      canonicalizeTextureAtlasSpecV1({
        schemaVersion: 1,
        width: 64,
        height: 64,
        usage: 'albedo',
        regions: [{ name: 'x', source: procedural(8, [1, 1, 1, 255]) }],
      }),
    ).toThrow(/content/);
    expect(() => canonicalizeTextureAtlasSpecV1(packed({ pack: { edge: 512 } }))).toThrow(/edge/);
    expect(() =>
      canonicalizeTextureAtlasSpecV1(packed({ pack: { edge: 1024, algorithm: 'shelf' } })),
    ).toThrow(/algorithm/);
    expect(() =>
      canonicalizeTextureAtlasSpecV1(
        packed({
          regions: Array.from({ length: 5 }, (_, i) => ({
            name: `big${i}`,
            source: procedural(512, [i, 0, 0, 255]),
          })),
        }),
      ),
    ).toThrow(/does not fit/);
    expect(() =>
      canonicalizeTextureAtlasSpecV1(
        packed({
          regions: [
            {
              name: 'pinned',
              source: {
                kind: 'resource',
                resourceId: 'brick.basecolor',
                pin: {
                  resourceId: 'brick',
                  revisionId: `sha256:${'a'.repeat(64)}`,
                  sha256: `sha256:${'a'.repeat(64)}`,
                },
              },
            },
          ],
        }),
      ),
    ).toThrow(/size/);
  });

  test('compiles under v1.2, validates the manifest and survives provenance without re-packing', async () => {
    const compiled = await compileTextureAtlasSpecV1(packed());
    expect(compiled.manifest.compilerId).toBe('kiln.texture-atlas.v1.2');
    expect(compiled.manifest.specHash).toBe(hashTextureAtlasSpecV1(compiled.spec));
    expect(validateTextureAtlasManifestV1(compiled.manifest, compiled.spec)).toEqual(
      compiled.manifest,
    );
    // The large region's top-left content texel carries its source colour.
    const large = compiled.manifest.regions.find((r) => r.name === 'large')!;
    const at = (large.content.y * compiled.spec.width + large.content.x) * 4;
    expect([...compiled.pixels.slice(at, at + 4)]).toEqual([200, 100, 50, 255]);
    const texture = await textureAtlas(packed());
    const record = readAtlasTextureProvenance(texture)!;
    expect(record.spec).toEqual(compiled.spec);
    expect(record.manifest.regions.map((r) => r.content)).toEqual(
      compiled.manifest.regions.map((r) => r.content),
    );
    const uv = remapUVToAtlas(new THREE.PlaneGeometry(), texture, 'large', {
      inputOrigin: 'bottom-left',
      mode: 'content-boundary',
    });
    expect(uv.userData.kilnAtlasBinding.content).toEqual(large.content);
  });
});
