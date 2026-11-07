import { expect, test } from 'bun:test';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { defaultPerspectiveNear, resolveAssetCamera } from '../camera';
import {
  collectTriangles,
  measureBounds,
  measureDrawnGeometry,
  measurePartBounds,
  nearestDrawnTriangleDistance,
} from '../raster';

/** Reading the index array means a walk over triangles, which camera framing has no need for. */
function forbidIndexRead(mesh: Mesh): Mesh {
  const index = mesh.geometry.index!;
  Object.defineProperty(index, 'array', {
    get() {
      throw new Error('bounds read the index array');
    },
  });
  return mesh;
}

/** A visible part, a hidden part far away, an instanced transform and an unreferenced vertex. */
function scene(): Group {
  const root = new Group();
  root.name = 'Root';
  root.position.set(1, 2, 3);
  root.rotation.set(0.3, 0.7, 0.1);
  const body = new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial());
  body.name = 'Body';
  body.position.set(-2, 0, 0);
  root.add(body);
  const hidden = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  hidden.name = 'Hidden';
  hidden.position.set(50, 0, 0);
  hidden.visible = false;
  root.add(hidden);
  const loose = new BufferGeometry();
  // The fourth vertex is in no triangle; the rasterizer's box has always counted every position.
  loose.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9], 3),
  );
  loose.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  const part = new Mesh(loose, new MeshStandardMaterial());
  part.name = 'Loose';
  root.add(part);
  return root;
}

test('the drawn box and triangle count equal what the rasterizer collects', () => {
  for (const node of [scene(), scene().children[0]!, scene().children[2]!]) {
    const collected = collectTriangles(node as never);
    const measured = measureDrawnGeometry(node);
    expect({ min: measured.min, max: measured.max }).toEqual(collected.bbox);
    expect(measured.triangles).toBe(collected.tris.length);
    expect(measureBounds(node)).toEqual(collected.bbox);
    expect(measurePartBounds(node)).toEqual(collected.bbox);
  }
});

test('an empty subtree measures as the zero box, and vertices without a triangle still count', () => {
  const empty = new Group();
  expect(measureDrawnGeometry(empty)).toEqual({ min: [0, 0, 0], max: [0, 0, 0], triangles: 0 });
  expect(measurePartBounds(empty)).toBeNull();

  const line = new BufferGeometry();
  line.setAttribute('position', new Float32BufferAttribute([1, 2, 3, 4, 5, 6], 3));
  const mesh = new Mesh(line, new MeshStandardMaterial());
  expect(collectTriangles(mesh as never).bbox).toEqual({ min: [1, 2, 3], max: [4, 5, 6] });
  expect(measureDrawnGeometry(mesh)).toEqual({ min: [1, 2, 3], max: [4, 5, 6], triangles: 0 });
  expect(measurePartBounds(mesh)).toBeNull();
});

test('measuring a scene walks positions and never triangle records', () => {
  const mesh = forbidIndexRead(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  expect(measureBounds(mesh)).toEqual({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
  expect(measureDrawnGeometry(mesh).triangles).toBe(12);
});

test('resolving an orbit or bounds-framed camera walks positions and never triangle records', () => {
  const root = new Group();
  root.add(forbidIndexRead(new Mesh(new BoxGeometry(), new MeshStandardMaterial())));
  const orbit = resolveAssetCamera(root, { camera: { type: 'orbit', azimuthDeg: 30 } });
  expect(orbit.subject.bounds).toEqual({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
  resolveAssetCamera(root, {
    camera: {
      type: 'explicit',
      projection: 'orthographic',
      position: [4, 4, 4],
      framing: 'bounds',
    },
  });
});

test('a subject with vertices but no triangle is still refused', () => {
  const root = new Group();
  const line = new BufferGeometry();
  line.setAttribute('position', new Float32BufferAttribute([1, 2, 3, 4, 5, 6], 3));
  root.add(new Mesh(line, new MeshStandardMaterial()));
  expect(() => resolveAssetCamera(root)).toThrow(/has no visible geometry/);
});

test('the nearest triangle distance matches the per-triangle reading', () => {
  const position: [number, number, number] = [5, -3, 7];
  const root = scene();
  let nearest = Number.POSITIVE_INFINITY;
  for (const { v } of collectTriangles(root as never).tris) {
    const dx = Math.max(
      Math.min(v[0]!, v[3]!, v[6]!) - position[0],
      0,
      position[0] - Math.max(v[0]!, v[3]!, v[6]!),
    );
    const dy = Math.max(
      Math.min(v[1]!, v[4]!, v[7]!) - position[1],
      0,
      position[1] - Math.max(v[1]!, v[4]!, v[7]!),
    );
    const dz = Math.max(
      Math.min(v[2]!, v[5]!, v[8]!) - position[2],
      0,
      position[2] - Math.max(v[2]!, v[5]!, v[8]!),
    );
    nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  expect(nearestDrawnTriangleDistance(root, position)).toBe(nearest);
  expect(defaultPerspectiveNear(root, position, 1000)).toBe(Math.max(0.001, nearest / 2));
  expect(nearestDrawnTriangleDistance(new Group(), position)).toBe(Number.POSITIVE_INFINITY);
  // Unindexed geometry reads its triangles in position order.
  const flat = new BufferGeometry();
  flat.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const single = new Mesh(flat, new MeshStandardMaterial());
  expect(nearestDrawnTriangleDistance(single, [0.5, 0.25, 2])).toBe(2);
  expect(nearestDrawnTriangleDistance(single, [0.5, 0.25, 0])).toBe(0);
});
