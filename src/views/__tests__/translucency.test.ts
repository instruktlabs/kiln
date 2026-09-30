import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { rasterizeCamera } from '../camera';
import { rasterizeView } from '../raster';

/**
 * A translucent pane in front of an opaque part must show that part through it,
 * whatever order the scene lists them in. Drawing the pane first used to write
 * its depth and hide everything behind it, so a glazed window read as empty.
 */
function glazedScene(paneFirst: boolean): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Housing';
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.5 }),
  );
  pane.name = 'Window';
  pane.position.set(0, 0, 1);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  body.name = 'Interior';
  if (paneFirst) root.add(pane, body);
  else root.add(body, pane);
  root.updateMatrixWorld(true);
  return root;
}

const center = (rgb: Uint8Array, size: number) => {
  const at = ((size >> 1) * size + (size >> 1)) * 3;
  return [rgb[at]!, rgb[at + 1]!, rgb[at + 2]!];
};

test('grid views show opaque geometry through a translucent pane in any scene order', () => {
  const size = 64;
  const behind = center(rasterizeView(glazedScene(false), [0, 0, 1], { size }), size);
  const front = center(rasterizeView(glazedScene(true), [0, 0, 1], { size }), size);
  // The red interior has no green; seen through blue glass the pixel has none either.
  expect(behind[1]).toBeLessThan(10);
  expect(front).toEqual(behind);
});

test('explicit camera views show opaque geometry through a translucent pane in any scene order', () => {
  const size = 64;
  const camera = {
    version: 'kiln.camera.v1' as const,
    projection: 'perspective' as const,
    position: [0, 0, 5] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    up: [0, 1, 0] as [number, number, number],
    aspect: 1,
    near: 0.1,
    far: 100,
    fovDeg: 40,
  };
  const behind = center(rasterizeCamera(glazedScene(false), camera, size), size);
  const front = center(rasterizeCamera(glazedScene(true), camera, size), size);
  expect(behind[1]).toBeLessThan(10);
  expect(front).toEqual(behind);
});
