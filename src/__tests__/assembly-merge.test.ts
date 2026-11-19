/**
 * `merge: 'byMaterial'` on the assembly helpers (#412).
 *
 * The pinned digests fix today's output of the call shapes no saved source exercises
 * (no corpus source calls wallWithOpening or room), so the option cannot move them.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { gameMaterial, room, wallWithOpening } from '../primitives';
import { sameFacts, sceneDigest } from './helpers/scene-digest';

const grey = () => gameMaterial(0x808080);
const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) out.push(node as THREE.Mesh);
  });
  return out;
};

const WALL_SHAPES = {
  plain: { length: 4, height: 2.8, thickness: 0.15 },
  door: { length: 4, height: 2.8, thickness: 0.15, opening: { kind: 'door' as const } },
  window: {
    length: 4,
    height: 3,
    thickness: 0.2,
    axis: 'x' as const,
    opening: { kind: 'window' as const, width: 1, height: 1, sill: 1 },
  },
  several: {
    length: 8,
    height: 3,
    thickness: 0.2,
    openings: [
      { kind: 'door' as const, offset: -2.5, width: 1, height: 2.1 },
      { kind: 'window' as const, offset: 0, width: 1, height: 0.8, sill: 0.4 },
      { kind: 'window' as const, offset: 0, width: 1, height: 0.8, sill: 1.6 },
    ],
  },
};

describe('existing call shapes are pinned', () => {
  test('wallWithOpening without new options', () => {
    const digests = Object.fromEntries(
      Object.entries(WALL_SHAPES).map(([key, options]) => [
        key,
        sceneDigest(wallWithOpening('W', grey(), options)),
      ]),
    );
    expect(digests).toEqual({
      plain: '0844cb46bd757a156bfd9cb986686fc7366b1e83e884aa9f271033cdbdaa2753',
      door: '1e237c8b69358a20567857f340f7f292fa7312284e8e66ec16800ce3f5bc8dca',
      window: 'ed26d4544107b5f44815e2ac2499c7ca4c9dc0f87da0a02ae7f7c77eb5651cec',
      several: '56074f154732baf9cfd6b52777f89e29c4d994da69343ffb58e53498a3521237',
    });
  });

  test('room without new options', () => {
    expect({
      defaults: sceneDigest(room('R', grey()).root),
      windows: sceneDigest(
        room('R', grey(), {
          width: 6,
          depth: 3,
          wallThickness: 0.4,
          openings: [
            { wall: 'front', kind: 'door' },
            { wall: 'left', kind: 'window', width: 1, height: 1, sill: 1 },
          ],
        }).root,
      ),
    }).toEqual({
      // #404 moved room's walls so the corners neither overlap nor leave a notch; these are
      // that output, which the new options leave unchanged.
      defaults: 'ba9432defdb61e41f1699e0266c6ad512d2b34c2d8fd181a39c659e30cb21728',
      windows: '9b3771af86e59b807bac9c4d82de5ff49c9bdb78d7532e138873ce7ccd0da85c',
    });
  });
});

describe("merge: 'byMaterial'", () => {
  test('wallWithOpening makes one part per material with the same triangles and bounds', () => {
    for (const options of Object.values(WALL_SHAPES)) {
      const material = grey();
      const pieces = wallWithOpening('W', material, options);
      const merged = wallWithOpening('W', material, { ...options, merge: 'byMaterial' });
      expect(merged.name).toBe('W');
      expect(merged.children.map((child) => child.name)).toEqual(['Mesh_W']);
      sameFacts(merged, pieces, 1);
      const geometry = (merged.children[0] as THREE.Mesh).geometry;
      expect(Object.keys(geometry.attributes).sort()).toEqual(['normal', 'position', 'uv']);
      expect((merged.children[0] as THREE.Mesh).material).toBe(material);
    }
  });

  test('the merged wall is pinned', () => {
    expect(
      sceneDigest(wallWithOpening('W', grey(), { ...WALL_SHAPES.door, merge: 'byMaterial' })),
    ).toBe('e9f5a37e76b412ae6ae2a1b618137db609e6bd070a8eee7f5b1e15bf4566830f');
  });

  test('room merges walls and floor, keeps the wall frames and names the floor part', () => {
    const material = grey();
    const pieces = room('R', material, {
      openings: [
        { wall: 'front', kind: 'door' },
        { wall: 'right', kind: 'window' },
      ],
    });
    const merged = room('R', material, {
      openings: [
        { wall: 'front', kind: 'door' },
        { wall: 'right', kind: 'window' },
      ],
      merge: 'byMaterial',
    });
    expect(meshes(merged.root).map((mesh) => mesh.name)).toEqual(['Mesh_R']);
    sameFacts(merged.root, pieces.root, 1);
    expect(merged.floor).toBe(meshes(merged.root)[0]!);
    for (const wall of Object.values(merged.walls)) {
      expect(wall.parent).toBe(merged.root);
      expect(wall.children).toEqual([]);
    }
    expect(merged.walls.front.position.toArray()).toEqual(pieces.walls.front.position.toArray());
  });

  test('rejects an unknown merge mode and leaves nothing behind', () => {
    const parent = new THREE.Object3D();
    expect(() =>
      wallWithOpening('W', grey(), {
        ...WALL_SHAPES.door,
        // @ts-expect-error: only 'byMaterial' is a merge mode
        merge: 'all',
        parent,
      }),
    ).toThrow(/merge must be 'byMaterial'/);
    expect(() =>
      // @ts-expect-error: only 'byMaterial' is a merge mode
      room('R', grey(), { merge: true, parent }),
    ).toThrow(/merge must be 'byMaterial'/);
    expect(parent.children).toEqual([]);
  });
});
