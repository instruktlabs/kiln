import { describe, expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../../render';
import { resolveAssetCamera } from '../camera';
import { registerReviewArtifact } from '../derivative-memo';
import { measuredDrawnGeometry } from '../drawn-geometry-memo';
import { loadGlbReviewScene } from '../glb';
import * as rasterModule from '../raster';

async function scene(register = true) {
  const source = new THREE.Group();
  source.name = 'Root';
  for (const [name, x] of [
    ['Left', -1],
    ['Right', 1],
  ] as const) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.position.x = x;
    source.add(mesh);
  }
  const bytes = (await renderSceneToGLB(source, { derivative: true, gltfExporter: 'three' })).bytes;
  const { root } = await loadGlbReviewScene(Uint8Array.from(bytes));
  if (register) registerReviewArtifact(root, 'sha256:bounds');
  return root as THREE.Object3D;
}

const orbit = (azimuthDeg: number) => ({ camera: { type: 'orbit' as const, azimuthDeg } });

describe('drawn geometry measured once per scene state', () => {
  test('shots of one state walk the geometry once, and the cameras do not change', async () => {
    const root = await scene();
    const reference = await scene(false);
    const walk = spyOn(rasterModule, 'measureDrawnGeometry');
    try {
      const shots = [0, 90, 180, 270].map((azimuth) => resolveAssetCamera(root, orbit(azimuth)));
      // The subject is the whole asset, so one walk answers both its box and the scene's.
      expect(walk).toHaveBeenCalledTimes(1);
      walk.mockClear();
      const expected = [0, 90, 180, 270].map((azimuth) =>
        resolveAssetCamera(reference, orbit(azimuth)),
      );
      expect(shots).toEqual(expected);
    } finally {
      walk.mockRestore();
    }
  });

  test('a hidden or moved part is measured again', async () => {
    const root = await scene();
    const first = measuredDrawnGeometry(root);
    const right = root.getObjectByName('Right')!;
    right.visible = false;
    expect(measuredDrawnGeometry(root).max[0]).toBeLessThan(first.max[0]);
    right.visible = true;
    right.position.x = 5;
    expect(measuredDrawnGeometry(root).max[0]).toBeGreaterThan(first.max[0]);
    right.position.x = 1;
    expect(measuredDrawnGeometry(root)).toEqual(first);
  });

  test('a morph weight or a bone pose that changes is measured again', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
    const morph = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    morph.name = 'Morph';
    morph.updateMorphTargets();
    const bone = new THREE.Bone();
    const skinGeometry = new THREE.BoxGeometry(1, 1, 1);
    const count = skinGeometry.getAttribute('position').count;
    skinGeometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    skinGeometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(
        new Float32Array(count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    const skinned = new THREE.SkinnedMesh(skinGeometry, new THREE.MeshStandardMaterial());
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    const root = new THREE.Group();
    root.add(morph, skinned);
    root.updateMatrixWorld(true);
    registerReviewArtifact(root, 'sha256:poses');
    const walk = spyOn(rasterModule, 'measureDrawnGeometry');
    try {
      measuredDrawnGeometry(root);
      measuredDrawnGeometry(root);
      expect(walk).toHaveBeenCalledTimes(1);
      morph.morphTargetInfluences![0] = 0.5;
      measuredDrawnGeometry(root);
      expect(walk).toHaveBeenCalledTimes(2);
      bone.position.x = 2;
      bone.updateMatrixWorld(true);
      measuredDrawnGeometry(root);
      expect(walk).toHaveBeenCalledTimes(3);
      measuredDrawnGeometry(root);
      expect(walk).toHaveBeenCalledTimes(3);
    } finally {
      walk.mockRestore();
    }
  });

  test('callers get their own copies, and an unregistered scene is always walked', async () => {
    const root = await scene();
    const box = measuredDrawnGeometry(root);
    box.min[0] = 99;
    expect(measuredDrawnGeometry(root).min[0]).not.toBe(99);
    const loose = await scene(false);
    const walk = spyOn(rasterModule, 'measureDrawnGeometry');
    try {
      measuredDrawnGeometry(loose);
      measuredDrawnGeometry(loose);
      expect(walk).toHaveBeenCalledTimes(2);
    } finally {
      walk.mockRestore();
    }
  });
});
