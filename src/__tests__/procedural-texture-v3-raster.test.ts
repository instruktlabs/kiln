import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { executeKilnCode } from '../render';
import { compileProceduralTextureSpecV3 } from '../procedural-texture-v3';
import { compileProceduralTextureSpecV2, proceduralTexture } from '../procedural-texture';
import type { ProceduralOperationV3 } from '../procedural-texture-v3-contract';

const compile = (
  operations: ProceduralOperationV3[],
  background: [number, number, number, number] = [0, 0, 0, 0],
) =>
  compileProceduralTextureSpecV3({ schemaVersion: 3, width: 4, height: 4, background, operations });
const pixel = (data: Uint8Array, x: number, y: number) =>
  Array.from(data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
const occupancy = (data: Uint8Array) =>
  Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => (data[(y * 4 + x) * 4 + 3] ? '#' : '.')).join(''),
  );

describe('V3 deterministic binary shape raster and RGBA', () => {
  test('rectangle clips, samples centers and excludes the right/bottom edge', () => {
    const { pixels } = compile([
      {
        op: 'paint',
        shape: { kind: 'rectangle', x: -1, y: 1, width: 3, height: 2 },
        rgba: [1, 2, 3, 255],
      },
    ]);
    expect(occupancy(pixels)).toEqual(['....', '##..', '##..', '....']);
    expect(pixel(pixels, 0, 1)).toEqual([1, 2, 3, 255]);
  });
  test('ellipse has an exact inclusive center coverage fixture', () => {
    expect(
      occupancy(
        compile([
          {
            op: 'paint',
            shape: { kind: 'ellipse', x: 0, y: 0, width: 4, height: 4 },
            rgba: [1, 2, 3, 255],
          },
        ]).pixels,
      ),
    ).toEqual(['.##.', '####', '####', '.##.']);
  });
  test('polygon uses even-odd fill, includes edge centers and supports degenerate clipping', () => {
    const { pixels } = compile([
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [0, 0],
            [4, 0],
            [0, 4],
          ],
        },
        rgba: [5, 6, 7, 255],
      },
    ]);
    expect(occupancy(pixels)).toEqual(['####', '###.', '##..', '#...']);
    expect(
      occupancy(
        compile([
          {
            op: 'paint',
            shape: {
              kind: 'polygon',
              points: [
                [-8, -8],
                [-4, -4],
                [-1, -1],
              ],
            },
            rgba: [5, 6, 7, 255],
          },
        ]).pixels,
      ),
    ).toEqual(['....', '....', '....', '....']);
  });
  test('line segments use inclusive round caps, including zero-length lines', () => {
    expect(
      occupancy(
        compile([
          {
            op: 'paint',
            shape: { kind: 'line', from: [0, 2], to: [4, 2], width: 1 },
            rgba: [255, 255, 255, 255],
          },
        ]).pixels,
      ),
    ).toEqual(['....', '####', '####', '....']);
    expect(
      occupancy(
        compile([
          {
            op: 'paint',
            shape: { kind: 'line', from: [2, 2], to: [2, 2], width: 2 },
            rgba: [255, 255, 255, 255],
          },
        ]).pixels,
      ),
    ).toEqual(['....', '.##.', '.##.', '....']);
  });
  test('source-over has exact straight-alpha integer rounding and zero opacity is inert', () => {
    const shape = { kind: 'rectangle' as const, x: 0, y: 0, width: 4, height: 4 };
    const { pixels } = compile([
      { op: 'paint', shape, rgba: [255, 0, 0, 128] },
      { op: 'paint', shape, rgba: [0, 0, 255, 128] },
      { op: 'paint', shape, rgba: [0, 255, 0, 255], opacity: 0 },
    ]);
    expect(pixel(pixels, 1, 1)).toEqual([85, 0, 170, 192]);
    expect(pixel(compile([{ op: 'paint', shape, rgba: [99, 77, 55, 0] }]).pixels, 1, 1)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(
      pixel(
        compile([{ op: 'paint', shape, rgba: [255, 0, 0, 255], opacity: 128 }], [0, 0, 255, 255])
          .pixels,
        1,
        1,
      ),
    ).toEqual([128, 0, 127, 255]);
  });
  test('mask clears outside, invert retains outside and zero-alpha normalizes RGB', () => {
    const shape = { kind: 'rectangle' as const, x: 1, y: 1, width: 2, height: 2 };
    const { pixels } = compile([{ op: 'mask', shape, alpha: 128 }], [20, 40, 60, 128]);
    expect(occupancy(pixels)).toEqual(['....', '.##.', '.##.', '....']);
    expect(pixel(pixels, 1, 1)).toEqual([20, 40, 60, 64]);
    expect(pixel(pixels, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(
      occupancy(compile([{ op: 'mask', shape, invert: true }], [20, 40, 60, 255]).pixels),
    ).toEqual(['####', '#..#', '#..#', '####']);
  });
  test('a leaf silhouette and composed web remain bounded original JSON surfaces', () => {
    const leaf = compile([
      {
        op: 'paint',
        shape: {
          kind: 'polygon',
          points: [
            [2, 0],
            [4, 2],
            [2, 4],
            [0, 2],
          ],
        },
        rgba: [60, 90, 20, 255],
      },
    ]);
    expect(occupancy(leaf.pixels)).toEqual(['.##.', '####', '####', '.##.']);
    const web = compile([
      {
        op: 'paint',
        shape: { kind: 'line', from: [0, 0], to: [4, 4], width: 1 },
        rgba: [200, 200, 200, 255],
      },
      {
        op: 'paint',
        shape: { kind: 'line', from: [0, 4], to: [4, 0], width: 1 },
        rgba: [200, 200, 200, 255],
      },
    ]);
    expect(occupancy(web.pixels)).toEqual(['#..#', '.##.', '.##.', '#..#']);
    expect(
      compile([
        {
          op: 'paint',
          shape: { kind: 'line', from: [0, 0], to: [4, 4], width: 1 },
          rgba: [200, 200, 200, 255],
        },
        {
          op: 'paint',
          shape: { kind: 'line', from: [0, 4], to: [4, 0], width: 1 },
          rgba: [200, 200, 200, 255],
        },
      ]).recipeHash,
    ).toBe(web.recipeHash);
  });
  test('all original patterns are available through explicit legacy-v2 delegation', () => {
    const layers = [
      { op: 'solid', color: 0x123456 },
      { op: 'checker', colorA: 0, colorB: 0xffffff },
      { op: 'stripes', colorA: 0, colorB: 0xffffff },
      { op: 'gradient', from: 0, to: 0xffffff },
      { op: 'bricks', brick: 0x123456, mortar: 0xffffff },
      { op: 'noise', colorA: 0, colorB: 0xffffff },
    ] as const;
    for (const layer of layers) {
      const spec = { schemaVersion: 2 as const, size: 4, layers: [layer] };
      expect(compile([{ op: 'legacy-v2', spec }]).pixels).toEqual(
        compileProceduralTextureSpecV2(spec).pixels,
      );
    }
  });
  test('public source dispatch retains legacy metadata and creates rectangular V3 textures', () => {
    const tex = proceduralTexture({ schemaVersion: 3, width: 4, height: 8, operations: [] });
    expect(tex.image.width).toBe(4);
    expect(tex.image.height).toBe(8);
    expect(tex.userData['kilnProcedural']).toMatchObject({
      schemaVersion: 3,
      compilerId: 'kiln.procedural-rgba.v3.1',
    });
    const absent = proceduralTexture({ size: 4, layers: [{ op: 'solid', color: 1 }] });
    const undefinedVersion = proceduralTexture({
      schemaVersion: undefined,
      size: 4,
      layers: [{ op: 'solid', color: 1 }],
    });
    expect(undefinedVersion.userData['kilnProcedural']).toEqual(absent.userData['kilnProcedural']);
    let reads = 0;
    const hostile = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get: () => {
        reads++;
        return 3;
      },
    });
    expect(() => proceduralTexture(hostile as never)).toThrow();
    expect(reads).toBe(0);
    expect(() => proceduralTexture({ schemaVersion: 9 } as never)).toThrow();
  });
  test('authored sandbox source creates an RGBA cutout without raw texture access', async () => {
    const source = `function build() {
      const root = createRoot('V3Cutout');
      const albedo = proceduralTexture({ schemaVersion:3, width:4, height:8,
        operations:[{op:'paint',shape:{kind:'polygon',points:[[0,0],[4,4],[0,8]]},rgba:[10,80,20,255]}] });
      createPart('Card',planeGeo(1,2),pbrMaterial({albedo,alphaMode:'mask',doubleSided:true}),{parent:root});
      return root;
    }`;
    const { root } = await executeKilnCode(source);
    const material = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.alphaTest).toBe(0.5);
    expect(material.side).toBe(THREE.DoubleSide);
    const image = material.map!.image as { width: number; height: number; data: Uint8Array };
    expect(image.width).toBe(4);
    expect(image.height).toBe(8);
    expect(new Set(Array.from(image.data.filter((_, i) => i % 4 === 3)))).toEqual(
      new Set([0, 255]),
    );
  });
});
