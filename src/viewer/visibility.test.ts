/**
 * `KHR_node_visibility` in the local viewer (R44).
 *
 * three's GLTFLoader draws every node, so the viewer hides each flagged node and its subtree in
 * the scene and in the lower levels of detail it builds; the triangle count and the camera
 * frame follow what draws.
 */
import { describe, expect, test } from 'bun:test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  HIDDEN_IN_LEVELS,
  HIDDEN_IN_LEVELS_TRIANGLES,
  HIDEABLE,
  hideable,
} from '../__tests__/helpers/visibility-fixture';
import { renderGLBInProcess } from '../render';
import { countTriangles, loadViewerLevels } from './lod';
import { applyNodeVisibility, drawnBounds } from './visibility';

const parse = async (code: string) =>
  new GLTFLoader().parseAsync(Uint8Array.from((await renderGLBInProcess(code)).glb).buffer, '');

describe('node visibility in the viewer', () => {
  test('flagged nodes hide with their subtrees; counts and frame follow what draws', async () => {
    const gltf = await parse(HIDEABLE);
    expect(countTriangles(gltf.scene)).toBe(36);
    expect(applyNodeVisibility(gltf, [gltf.scene])).toBe(2);
    const node = (name: string) => gltf.scene.getObjectByName(name)!;
    expect(node('Mesh_Cover').visible).toBe(false);
    expect(node('Joint_Panel').visible).toBe(false);
    expect(node('Mesh_Inner').visible).toBe(true);
    expect(node('Mesh_Body').visible).toBe(true);
    expect(countTriangles(gltf.scene)).toBe(12);
    const box = drawnBounds(gltf.scene);
    expect(box.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([0.5, 1, 0.5]);
  });

  test('a model without flags is untouched and frames as before', async () => {
    const gltf = await parse(hideable(false));
    expect(applyNodeVisibility(gltf, [gltf.scene])).toBe(0);
    expect(countTriangles(gltf.scene)).toBe(36);
    expect(drawnBounds(gltf.scene).max.y).toBeCloseTo(3.1, 6);
  });

  test('lower levels of detail keep their flags and count what draws', async () => {
    const gltf = await parse(HIDDEN_IN_LEVELS);
    applyNodeVisibility(gltf, [gltf.scene]);
    const levels = await loadViewerLevels(gltf);
    expect(levels!.triangles).toEqual(HIDDEN_IN_LEVELS_TRIANGLES.model);
    expect(levels!.chains[0]!.levels[1]!.getObjectByName('Mesh_Spoiler')!.visible).toBe(false);
  });
});
