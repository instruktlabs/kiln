/**
 * The local viewer's level control over MSFT_lod chains.
 *
 * three's GLTFLoader draws each chain's LOD0 and ignores the extension, so the viewer builds
 * the lower levels through the same parser and swaps a chosen level into LOD0's place. Kiln's
 * own chains and a chain another tool wrote load the same way.
 */
import { describe, expect, test } from 'bun:test';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { importedLodGlb, TIERED_CAR, WHEELS } from '../__tests__/helpers/lod-fixture';
import { renderGLBInProcess } from '../render';
import { countTriangles, describeLevels, levelLabels, loadViewerLevels, showLevel } from './lod';

const parse = (glb: Uint8Array) => new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');

function names(root: Object3D): string[] {
  const out: string[] = [];
  root.traverse((node) => out.push(node.name));
  return out;
}

describe('the viewer level control', () => {
  test('lower levels load detached and a level swaps into LOD0 place', async () => {
    const gltf = await parse((await renderGLBInProcess(TIERED_CAR)).glb);
    const before = names(gltf.scene);
    const levels = await loadViewerLevels(gltf);

    expect(levels!.chains.map((chain) => chain.levels.map((level) => level.name))).toEqual([
      ['Body_LOD0', 'Body_LOD1', 'Body_LOD2'],
      ...WHEELS.map((wheel) => [`${wheel}_LOD0`, `${wheel}_LOD1`]),
    ]);
    // The body draws 24, 12 and 12 triangles; four 12-triangle tyres vanish from LOD1, and a
    // chain shorter than the chosen level keeps its last level.
    expect(levels!.triangles).toEqual([72, 12, 12]);
    expect(names(gltf.scene)).toEqual(before);
    expect(countTriangles(gltf.scene)).toBe(72);

    showLevel(levels!, 2);
    expect(countTriangles(gltf.scene)).toBe(12);
    expect(gltf.scene.getObjectByName('Car')!.children.map((child) => child.name)).toEqual([
      'Body_LOD2',
      ...WHEELS.map((wheel) => `${wheel}_LOD1`),
    ]);
    showLevel(levels!, 1);
    expect(countTriangles(gltf.scene)).toBe(12);
    expect(names(gltf.scene)).toContain('Body_LOD1');
    showLevel(levels!, 0);
    expect(names(gltf.scene)).toEqual(before);
  });

  test('an imported chain gets the same control', async () => {
    const gltf = await parse(await importedLodGlb());
    const levels = await loadViewerLevels(gltf);

    expect(levels!.chains.map((chain) => chain.levels.map((level) => level.name))).toEqual([
      ['Bus_LOD0', 'Bus_LOD1', 'Bus_LOD2'],
    ]);
    expect(levels!.triangles).toEqual([24, 24, 24]);
    showLevel(levels!, 1);
    expect(gltf.scene.getObjectByName('Bus')!.children.map((child) => child.name)).toEqual([
      'Bus_LOD1',
      'Bus_Sign',
    ]);
  });

  test('a GLB without chains has no level control', async () => {
    const gltf = await parse(
      (
        await renderGLBInProcess(`const meta = { name: 'Plain' };
function build() {
  const root = createRoot('Plain');
  createPart('Block', boxGeo(1, 1, 1), gameMaterial(0x999999), { parent: root });
  return root;
}`)
      ).glb,
    );
    expect(await loadViewerLevels(gltf)).toBeUndefined();
  });

  test('labels name each level with its triangles', () => {
    expect(levelLabels([72, 12, 12])).toEqual([
      'LOD0 · 72 triangles',
      'LOD1 · 12 triangles',
      'LOD2 · 12 triangles',
    ]);
    expect(describeLevels([120, 45])).toBe('LOD0 120 · LOD1 45 triangles');
  });
});
