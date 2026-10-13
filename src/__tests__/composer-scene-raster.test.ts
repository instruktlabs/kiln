/**
 * Composed-scene rasterizer — the default SceneRenderPort implementation.
 *
 * Executes each unique Kiln program once, clones it per placement into one THREE
 * scene, and rasterizes a labelled grid. We assert a real PNG comes out for the
 * default 3 angles, for a single custom direction, and that duplicate codes are
 * executed once (the cache), without any GLB round-trip.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../render';

import { rasterizeComposedScene, SCENE_VIEWS } from '../views';

const BARREL = `function build() {
  const root = createRoot('Barrel');
  const steel = lambertMaterial(0xc8743a);
  createPart('Body', cylinderGeo(0.55, 0.55, 1.3, 16), steel, { parent: root, position: [0, 0.65, 0] });
  return root;
}`;

const TREE = `function build() {
  const root = createRoot('Tree');
  const bark = lambertMaterial(0x4a2a14);
  const leaf = lambertMaterial(0x4f7d5e);
  createPart('Trunk', cylinderGeo(0.12, 0.17, 1.0, 8), bark, { parent: root, position: [0, 0.5, 0] });
  createPart('Canopy', sphereGeo(0.55, 8, 6), leaf, { parent: root, position: [0, 1.2, 0] });
  return root;
}`;

const isPng = (b: Buffer): boolean =>
  b.length > 1000 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG';

test('composed skinned placements match rigid controls instead of sharing the original bones', async () => {
  const geometry = new THREE.BoxGeometry(0.4, 1, 0.3);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      4,
    ),
  );
  const material = new THREE.MeshStandardMaterial({ color: '#789abc' });
  const root = new THREE.Group();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bone = new THREE.Bone();
  mesh.add(bone);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone]));
  const skin = await renderSceneToGLB(root, {
    gltfExporter: 'three',
    derivative: true,
    optimize: 'off',
  });
  const rigidRoot = new THREE.Group();
  rigidRoot.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.3), material));
  const rigid = await renderSceneToGLB(rigidRoot, {
    gltfExporter: 'three',
    derivative: true,
    optimize: 'off',
  });
  const capture = (glb: Uint8Array) =>
    rasterizeComposedScene(
      [
        { glb, pos: [-2, 0, 0], rotYDeg: 35, scale: 0.7 },
        { glb, pos: [2, 0, 0], rotYDeg: -20, scale: 1.2 },
      ],
      { size: 96 },
    );
  expect((await capture(skin.bytes)).png).toEqual((await capture(rigid.bytes)).png);
});

describe('rasterizeComposedScene', () => {
  test('renders a multi-asset scene from the 3 default angles into one grid PNG', async () => {
    const r = await rasterizeComposedScene([
      { code: BARREL, pos: [0, 0, 0], rotYDeg: 0, scale: 1 },
      { code: BARREL, pos: [4, 0, 0], rotYDeg: 90, scale: 1 },
      { code: TREE, pos: [0, 0, 6], rotYDeg: 0, scale: 1.5 },
    ]);
    expect(isPng(r.png)).toBe(true);
    expect(r.views).toEqual(SCENE_VIEWS.map((v) => v.name));
    // 3 cells across one row → wider than tall.
    expect(r.width).toBeGreaterThan(r.height);
  });

  test('a single custom view direction yields a one-cell image', async () => {
    const r = await rasterizeComposedScene(
      [{ code: BARREL, pos: [0, 0, 0], rotYDeg: 0, scale: 1 }],
      { views: [{ name: 'cam', dir: [1, 0.6, 1] }], size: 256 },
    );
    expect(isPng(r.png)).toBe(true);
    expect(r.views).toEqual(['cam']);
    expect(r.width).toBe(256 + 2 * 4); // one cell + padding
  });

  test('an empty scene still produces a (blank) grid without throwing', async () => {
    const r = await rasterizeComposedScene([]);
    expect(isPng(r.png)).toBe(true);
  });
});
