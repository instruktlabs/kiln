import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import {
  compileProceduralTextureSpecV2,
  compileProceduralTextureSpecV3,
  proceduralTexture,
} from '../procedural-texture';
import { ProceduralPixelCache } from '../procedural-texture-cache';
import { executeKilnCode } from '../render';

const sha = (pixels: Uint8Array) => createHash('sha256').update(pixels).digest('hex');

/** Every V2 layer op and blend mode, at an odd angle, so each arithmetic path is pinned. */
const V2_ALL_LAYERS = {
  schemaVersion: 2 as const,
  size: 64,
  usage: 'albedo' as const,
  layers: [
    { op: 'gradient' as const, from: 0x203040, to: 0xe0c0a0, angleDeg: 33 },
    {
      op: 'checker' as const,
      colorA: 0x101010,
      colorB: 0xf0f0f0,
      squares: 6,
      blend: 'multiply' as const,
      opacity: 0.4,
    },
    {
      op: 'stripes' as const,
      colorA: 0x400000,
      colorB: 0x00c0ff,
      count: 9,
      angleDeg: 71,
      blend: 'screen' as const,
      opacity: 0.3,
    },
    {
      op: 'bricks' as const,
      brick: 0x8a4a2a,
      mortar: 0xcfc6b8,
      rows: 7,
      cols: 3,
      mortarWidth: 0.08,
      stagger: 0.5,
      blend: 'overlay' as const,
      opacity: 0.5,
    },
    {
      op: 'noise' as const,
      colorA: 0x112233,
      colorB: 0xddeeff,
      scale: 5,
      octaves: 4,
      seed: 9,
      blend: 'overlay' as const,
      opacity: 0.6,
    },
    {
      op: 'cellular' as const,
      colorA: 0x000000,
      colorB: 0xffffff,
      cellsX: 5,
      cellsY: 4,
      seed: 3,
      blend: 'multiply' as const,
      opacity: 0.25,
    },
    { op: 'solid' as const, color: 0x336699, blend: 'normal' as const, opacity: 0.1 },
  ],
};

/** Every V3 operation: paints of each shape, a mask, a legacy-v2 layer, stamps and a palette. */
const V3_ALL_OPERATIONS = {
  schemaVersion: 3 as const,
  width: 64,
  height: 64,
  usage: 'albedo' as const,
  background: [20, 30, 40, 255] as [number, number, number, number],
  operations: [
    {
      op: 'legacy-v2' as const,
      spec: {
        schemaVersion: 2 as const,
        size: 64,
        layers: [
          {
            op: 'noise' as const,
            colorA: 0x202020,
            colorB: 0xc0a080,
            scale: 3,
            octaves: 2,
            seed: 4,
          },
        ],
      },
      alpha: 200,
      opacity: 180,
    },
    {
      op: 'paint' as const,
      shape: { kind: 'rectangle' as const, x: 3, y: 4, width: 20, height: 9 },
      rgba: [200, 40, 40, 180] as [number, number, number, number],
    },
    {
      op: 'paint' as const,
      shape: { kind: 'ellipse' as const, x: 18, y: 10, width: 21, height: 13 },
      rgba: [40, 200, 90, 255] as [number, number, number, number],
      opacity: 150,
    },
    {
      op: 'paint' as const,
      shape: {
        kind: 'polygon' as const,
        points: [
          [2, 30],
          [20, 22],
          [30, 38],
          [8, 36],
        ] as Array<[number, number]>,
      },
      rgba: [250, 220, 10, 220] as [number, number, number, number],
    },
    {
      op: 'paint' as const,
      shape: {
        kind: 'line' as const,
        from: [1, 1] as [number, number],
        to: [46, 37] as [number, number],
        width: 3,
      },
      rgba: [0, 0, 255, 255] as [number, number, number, number],
    },
    {
      op: 'stamps' as const,
      shape: { kind: 'ellipse' as const, x: 0, y: 0, width: 5, height: 5 },
      rgba: [255, 255, 255, 160] as [number, number, number, number],
      count: 12,
      seed: 77,
      area: { x: 0, y: 0, width: 64, height: 64 },
      periodic: true,
    },
    {
      op: 'mask' as const,
      shape: { kind: 'ellipse' as const, x: 30, y: 2, width: 16, height: 16 },
      alpha: 90,
      invert: true,
    },
  ],
  palette: {
    colors: [0x101820, 0x806040, 0xc0c0c0, 0x30a050, 0xf0e020, 0x2040e0],
    dither: 'bayer4' as const,
  },
};

test('V2 pixels stay exactly the same for every layer op and blend', () => {
  expect(sha(compileProceduralTextureSpecV2(V2_ALL_LAYERS).pixels)).toBe(
    '22233a82cb641724327c7c5bf15d965accfc7e4f198f2b9734f7198888e706f2',
  );
});

test('V3 pixels stay exactly the same for every operation', () => {
  expect(sha(compileProceduralTextureSpecV3(V3_ALL_OPERATIONS).pixels)).toBe(
    '5322eb3731cf487133c54197bbec0dc3cff76d19b0f53d01baf2532a180420b1',
  );
});

test('a cached recipe returns the same pixels in a private buffer', () => {
  const cache = new ProceduralPixelCache();
  const first = compileProceduralTextureSpecV3(V3_ALL_OPERATIONS, { cache });
  const second = compileProceduralTextureSpecV3(V3_ALL_OPERATIONS, { cache });
  expect(cache.stats()).toEqual({ hits: 1, misses: 2 });
  expect(sha(second.pixels)).toBe(sha(compileProceduralTextureSpecV3(V3_ALL_OPERATIONS).pixels));
  expect(second.pixels).not.toBe(first.pixels);
  first.pixels.fill(0);
  const third = compileProceduralTextureSpecV2(V3_ALL_OPERATIONS.operations[0]!.spec, { cache });
  // The nested legacy-v2 recipe compiled once inside the first V3 compile.
  expect(cache.stats()).toEqual({ hits: 2, misses: 2 });
  expect(third.pixels.some((v) => v !== 0)).toBe(true);
  expect(sha(compileProceduralTextureSpecV3(V3_ALL_OPERATIONS, { cache }).pixels)).toBe(
    sha(second.pixels),
  );
});

test('textures built from one cached recipe do not share pixels', () => {
  const cache = new ProceduralPixelCache();
  const a = proceduralTexture(V2_ALL_LAYERS, { cache });
  const b = proceduralTexture(V2_ALL_LAYERS, { cache });
  const aData = a.image.data as Uint8Array;
  const bData = b.image.data as Uint8Array;
  expect(aData).not.toBe(bData);
  expect(sha(aData)).toBe(sha(bData));
  aData.fill(1);
  expect(sha(bData)).toBe(sha(compileProceduralTextureSpecV2(V2_ALL_LAYERS).pixels));
  expect(b.userData['kilnProcedural']).toEqual(
    proceduralTexture(V2_ALL_LAYERS).userData['kilnProcedural'],
  );
});

test('a recipe larger than the cache budget compiles every time', () => {
  const cache = new ProceduralPixelCache(1024);
  compileProceduralTextureSpecV2(V2_ALL_LAYERS, { cache });
  compileProceduralTextureSpecV2(V2_ALL_LAYERS, { cache });
  expect(cache.stats()).toEqual({ hits: 0, misses: 2 });
});

test('a program that edits one texture cannot change a later texture of the same recipe', async () => {
  const code = `
const meta = { name: 'cache-isolation', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const spec = { schemaVersion: 2, size: 8, usage: 'albedo', layers: [{ op: 'noise', colorA: 0x102030, colorB: 0xf0e0d0, scale: 2, octaves: 2, seed: 5 }] };
  const first = proceduralTexture(spec);
  first.image.data.fill(7);
  const second = proceduralTexture(spec);
  createPart('Mesh_A', boxGeo(1, 1, 1), pbrMaterial({ albedo: second }), { parent: root });
  return root;
}
`;
  const { root } = await executeKilnCode(code);
  let albedo: Uint8Array | undefined;
  root.traverse((node) => {
    const map = (node as { material?: { map?: { image: { data: Uint8Array } } } }).material?.map;
    if (map) albedo = map.image.data;
  });
  const fresh = compileProceduralTextureSpecV2({
    schemaVersion: 2,
    size: 8,
    usage: 'albedo',
    layers: [{ op: 'noise', colorA: 0x102030, colorB: 0xf0e0d0, scale: 2, octaves: 2, seed: 5 }],
  }).pixels;
  expect(albedo && sha(albedo)).toBe(sha(fresh));
});
