import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  SHADOW_RESOLUTION,
  composeContactShadow,
  rebakeDue,
  restoreCulling,
  viewerFrameloop,
} from '../src/components/viewer-draws';

const channel = (size: number, at: (x: number, y: number) => number) => {
  const red = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) red[(y * size + x) * 4] = at(x, y);
  return red;
};
const alphaAt = (pixels: Uint8Array, size: number, x: number, y: number) =>
  pixels[(y * size + x) * 4 + 3] as number;

describe('the baked contact shadow', () => {
  const options = { opacity: 0.45, blur: 2.4, colour: [0x29, 0x2d, 0x29] as const };

  test('an empty ground has no shadow at all', () => {
    const pixels = composeContactShadow(channel(32, () => 0), 32, options);
    expect(pixels.length).toBe(32 * 32 * 4);
    expect(Math.max(...pixels.filter((_, index) => index % 4 === 3))).toBe(0);
  });

  test('the colour is the same everywhere; only the alpha carries the shadow', () => {
    const pixels = composeContactShadow(channel(16, () => 255), 16, options);
    for (let i = 0; i < pixels.length; i += 4) {
      expect([pixels[i], pixels[i + 1], pixels[i + 2]]).toEqual([0x29, 0x2d, 0x29]);
    }
  });

  test('full coverage reads back at the opacity asked for, as the old shadow did', () => {
    const size = 64;
    const pixels = composeContactShadow(channel(size, () => 255), size, options);
    expect(alphaAt(pixels, size, size / 2, size / 2)).toBeCloseTo(0.45 * 255, -0.5);
  });

  test('a lit point spreads into a soft pool centred where it was', () => {
    const size = 128;
    const c = size / 2;
    const source = channel(size, (x, y) => (Math.abs(x - c) < 6 && Math.abs(y - c) < 6 ? 255 : 0));
    const pixels = composeContactShadow(source, size, { ...options, opacity: 1 });
    const centre = alphaAt(pixels, size, c, c);
    expect(centre).toBeGreaterThan(0);
    expect(alphaAt(pixels, size, c + 8, c)).toBeLessThan(centre);
    expect(alphaAt(pixels, size, c - 8, c)).toBeCloseTo(alphaAt(pixels, size, c + 8, c), -1);
    expect(alphaAt(pixels, size, c, c + 8)).toBeCloseTo(alphaAt(pixels, size, c, c - 8), -1);
    expect(alphaAt(pixels, size, 2, 2)).toBe(0);
  });

  test('the blur is measured in the same fraction of the texture at every resolution', () => {
    const spread = (size: number) => {
      const c = size / 2;
      const r = size / 16;
      const pixels = composeContactShadow(
        channel(size, (x, y) => (Math.abs(x - c) < r && Math.abs(y - c) < r ? 255 : 0)),
        size,
        { ...options, opacity: 1 },
      );
      return alphaAt(pixels, size, Math.round(c + r * 2), c);
    };
    expect(Math.abs(spread(256) - spread(512))).toBeLessThanOrEqual(6);
  });

  test('keeps the resolution the old shadow used', () => {
    expect(SHADOW_RESOLUTION).toBe(512);
  });
});

describe('drawing only when something changes', () => {
  test('a still model waits for the camera, so an idle page draws nothing', () => {
    expect(viewerFrameloop({ spin: false, clipPlaying: false })).toBe('demand');
  });

  test('turntable and a playing clip draw every frame', () => {
    expect(viewerFrameloop({ spin: true, clipPlaying: false })).toBe('always');
    expect(viewerFrameloop({ spin: false, clipPlaying: true })).toBe('always');
  });

  test('a playing clip refreshes the shadow a few times a second, not every frame', () => {
    expect(rebakeDue(0.1, 0)).toBe(false);
    expect(rebakeDue(0.25, 0)).toBe(true);
    expect(rebakeDue(10, 9.9)).toBe(false);
  });

  test('a clip played again after a pause re-bakes at once, though the clock restarted at zero', () => {
    // React Three Fiber restarts its clock whenever the frame loop changes, so the last bake can be in the clock's future.
    expect(rebakeDue(0.02, 40)).toBe(true);
  });
});

describe('culling that cannot make a part blink', () => {
  const offsetBox = (x: number) => {
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(x, 0, 0);
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  };

  test('still parts are culled against a sphere measured from their real vertices', () => {
    const mesh = offsetBox(500);
    // What a loader can leave behind: a sphere that does not contain the vertices.
    mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    mesh.frustumCulled = false;
    restoreCulling(mesh);
    expect(mesh.frustumCulled).toBe(true);
    expect(mesh.geometry.boundingSphere?.center.x).toBeCloseTo(500, 5);
  });

  test('a shared geometry is measured once', () => {
    const first = offsetBox(10);
    const second = new THREE.Mesh(first.geometry, first.material);
    const group = new THREE.Group().add(first, second);
    const measured = restoreCulling(group);
    expect(measured).toBe(1);
    expect(second.frustumCulled).toBe(true);
  });

  test('skinned and morphing parts stay drawn: their rest-pose sphere does not bound them', () => {
    const skinned = offsetBox(0) as unknown as THREE.SkinnedMesh;
    (skinned as unknown as { isSkinnedMesh: boolean }).isSkinnedMesh = true;
    const morphing = offsetBox(0);
    morphing.morphTargetInfluences = [0.5];
    const group = new THREE.Group().add(skinned, morphing);
    restoreCulling(group);
    expect(skinned.frustumCulled).toBe(false);
    expect(morphing.frustumCulled).toBe(false);
  });

  test('objects that are not meshes keep their defaults', () => {
    const light = new THREE.DirectionalLight();
    restoreCulling(light);
    expect(light.frustumCulled).toBe(true);
  });
});
