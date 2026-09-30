import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { createKilnDiscoveryDef } from '../../tools/discovery';
import { resolveAssetCamera, selectCameraSubject } from '../camera';

const box = (name: string, size: number) => {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  mesh.name = name;
  return mesh;
};

test('an ambiguous subject name lists exactly the paths that share it', () => {
  const root = new Group();
  root.name = 'Hall';
  for (let i = 0; i < 50; i++) root.add(box(`Filler${i}`, 1));
  const wing = new Group();
  wing.name = 'Wing';
  wing.add(box('Door', 1));
  root.add(wing);
  const locator = new Object3D();
  locator.name = 'Door';
  root.add(locator);
  let message = '';
  try {
    selectCameraSubject(root, { name: 'Door' });
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain('2 nodes are named "Door"');
  expect(message).toContain('/Hall[0]/Wing[0]/Door[0]');
  expect(message).toContain('/Hall[0]/Door[0]');
  expect(message).not.toContain('Filler');
});

test('a missing subject name suggests similar paths before the listing', () => {
  const root = new Group();
  root.name = 'Hall';
  for (let i = 0; i < 50; i++) root.add(box(`Filler${i}`, 1));
  root.add(box('MainDoor', 1));
  let message = '';
  try {
    selectCameraSubject(root, { name: 'door' });
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain('no node is named "door"');
  expect(message).toContain('similar: /Hall[0]/MainDoor[0]');
});

test('unknown camera keys name the accepted keys', () => {
  const root = new Group();
  root.name = 'Asset';
  root.add(box('Body', 1));
  expect(() =>
    resolveAssetCamera(root, {
      camera: {
        type: 'explicit',
        projection: 'perspective',
        position: [3, 3, 3],
        target: [0, 0, 0],
        fov: 40,
      } as never,
    }),
  ).toThrow(/camera\.fov is unknown; use fovDeg.*accepted keys: .*fovDeg/);
});

test('an explicit perspective near plane defaults to half the distance to the nearest geometry', () => {
  const near = (root: Group, position: [number, number, number], extra = {}) =>
    resolveAssetCamera(root, {
      camera: {
        type: 'explicit',
        projection: 'perspective',
        position,
        target: [0, 0, 0],
        ...extra,
      },
    }).camera.near;
  const small = new Group();
  small.name = 'Small';
  small.add(box('Body', 1));
  expect(near(small, [3, 3, 3])).toBeCloseTo(Math.sqrt(3 * 2.5 ** 2) / 2, 9);
  // A 945 m shell seen from 100 m keeps depth precision instead of a 1 mm near plane.
  const head = new Group();
  head.name = 'Head';
  head.add(box('Shell', 945));
  expect(near(head, [0, 0, 945 / 2 + 100])).toBeCloseTo(50, 9);
  // Inside the shell, 2.5 m from a wall: nothing nearer than the plane is clipped.
  expect(near(head, [0, 0, 945 / 2 - 2.5])).toBeCloseTo(1.25, 9);
  // Against geometry the old 1 mm floor remains, and an explicit near still wins.
  expect(near(small, [0, 0, 0.5])).toBe(0.001);
  expect(near(head, [0, 0, 600], { near: 0.001 })).toBe(0.001);
  // Deforming geometry can move toward the camera after this measurement: keep the floor.
  const morphing = new Group();
  morphing.name = 'Morph';
  const blob = box('Blob', 1);
  blob.geometry.morphAttributes.position = [blob.geometry.getAttribute('position').clone()];
  morphing.add(blob);
  expect(near(morphing, [3, 3, 3])).toBe(0.001);
});

test('discover capabilities name the camera lens and clip fields', async () => {
  const result = (await createKilnDiscoveryDef({}).run({ capabilities: true })) as {
    capabilities: { camera: Record<string, unknown> };
  };
  const text = JSON.stringify(result.capabilities.camera);
  for (const key of ['fovDeg', 'halfHeight', 'near', 'far']) expect(text).toContain(key);
});
