import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { collectTriangleBuffers, rasterizeCollected, rasterizeView, SIX_VIEWS } from '../raster';
import { renderViewGrid } from '../index';

/**
 * Pins the rasterizer's exact pixels on a scene that exercises every per-triangle branch:
 * opaque and translucent materials (compositing order), double and back sides, a mirrored
 * mesh (winding parity), multi-material groups, a degenerate triangle, an out-of-range index,
 * a fully transparent material and a hidden mesh. Collecting the triangles once and
 * rasterizing each view from that collection (issue #431) must not move a single byte.
 */
function trickyScene(): THREE.Group {
  const root = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 0.6, 0.8);
  box.clearGroups();
  box.addGroup(0, 18, 0);
  box.addGroup(18, 18, 1);
  const body = new THREE.Mesh(box, [
    new THREE.MeshStandardMaterial({ color: 0xc04020 }),
    new THREE.MeshStandardMaterial({ color: 0x2060c0, side: THREE.DoubleSide }),
  ]);
  body.position.set(0, 0.3, 0);
  body.rotation.set(0.2, 0.5, -0.1);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1),
    new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: 0.4 }),
  );
  pane.position.set(0.6, 0.4, 0.2);
  pane.rotation.y = 0.7;
  const pane2 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 }),
  );
  pane2.position.set(-0.4, 0.5, 0.5);
  const mirrored = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.7, 7),
    new THREE.MeshLambertMaterial({ color: 0x40a040 }),
  );
  mirrored.scale.set(-1, 1, 1);
  mirrored.position.set(-0.5, 0.2, -0.3);
  const back = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 9, 6),
    new THREE.MeshBasicMaterial({ color: 0x9050d0, side: THREE.BackSide }),
  );
  back.position.set(0.4, 0.7, -0.4);
  const odd = new THREE.BufferGeometry();
  odd.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3),
  );
  // Second triangle is degenerate; the third reaches past the vertex buffer.
  odd.setIndex([0, 1, 2, 3, 4, 5, 0, 1, 9]);
  const oddMesh = new THREE.Mesh(odd, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  oddMesh.position.set(0, -0.2, 0.6);
  const invisible = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0 }),
  );
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshBasicMaterial());
  hidden.visible = false;
  root.add(pane, body, pane2, mirrored, back, oddMesh, invisible, hidden);
  root.updateMatrixWorld(true);
  return root;
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('six views of the tricky scene keep their exact pixels', () => {
  const hashes = SIX_VIEWS.map((view) => sha(rasterizeView(trickyScene(), view.dir, { size: 96 })));
  expect(hashes).toEqual(EXPECTED_VIEW_HASHES);
});

test('one collection serves every view with the same pixels as a fresh collection', () => {
  const root = trickyScene();
  const collected = collectTriangleBuffers(root);
  for (const view of SIX_VIEWS) {
    for (const backfaceCull of [true, false]) {
      const options = { size: 80, backfaceCull };
      expect(sha(rasterizeCollected(collected, view.dir, options))).toBe(
        sha(rasterizeView(root, view.dir, options)),
      );
    }
  }
});

test('the default grid keeps its exact PNG', async () => {
  const grid = await renderViewGrid(trickyScene(), { size: 64 });
  expect(sha(grid.png)).toBe(EXPECTED_GRID_HASH);
});

// Recorded from the per-view collector before #431 changed it.
const EXPECTED_VIEW_HASHES = [
  'a934e2756c4c9c7b406772ea84be689aca9c2ceecf0fc86d02d7910703703ebb',
  'a97312e6a90318a4a4991fb6d1e9cad98f8de1ac44dade67516a768a4aa87024',
  '57dad7b076b8cccb1d006d739887394befe7633a7f4c292e30af93817f3a1f71',
  '9f64574bddd3cfe59c4c6e45f526802b6db7c0e7cbdd2535c959543c520db5d1',
  'f65bc03513d14a98040612d3c86714f8825cd84db3956db4b3d4933f9817f10b',
  '15cddf556b6e2bb678e8d2112c6322819165a53900b1c4431e3eb80cf0773e5b',
];
const EXPECTED_GRID_HASH = '071da08031c7835c46534cb99677f7cc636f5bc8b33379df3fa829ff72666198';
