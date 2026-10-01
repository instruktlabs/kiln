import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createVehiclePaint } from '../src/components/vehicle-paint';

function fixture() {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: '#ebebeb', roughness: 0.3 });
  paint.name = 'Paint';
  const light = new THREE.MeshStandardMaterial({ color: '#d3231d', emissive: '#120000' });
  light.name = 'Taillight';
  for (let tier = 0; tier < 3; tier++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [paint, light]);
    mesh.name = `body-${tier}`;
    root.add(mesh);
  }
  return { root, paint, light };
}

test('only the six audited vehicle IDs can expose a Paint control', () => {
  const { root } = fixture();
  for (const id of ['hatchback', 'sedan', 'suv', 'pickup', 'box-truck', 'transit-bus'])
    expect(createVehiclePaint(root, id)).toBeDefined();
  for (const id of [undefined, 'farmer', 'Paint', 'generic-unreviewed-car'])
    expect(createVehiclePaint(root, id)).toBeUndefined();
});

test('paint changes are isolated to one viewer and preserve lights, geometry and surface finish', () => {
  const { root, paint, light } = fixture();
  const first = createVehiclePaint(root, 'sedan')!;
  const second = createVehiclePaint(root, 'sedan')!;
  first.setColour('#275aad');
  expect(first.scene).not.toBe(root);
  for (let i = 0; i < 3; i++) {
    const original = root.children[i] as THREE.Mesh;
    const changed = first.scene.children[i] as THREE.Mesh;
    const mats = changed.material as THREE.MeshStandardMaterial[];
    expect(changed.geometry).toBe(original.geometry);
    expect(mats[0]).not.toBe(paint);
    expect(mats[0].color.getHexString()).toBe('275aad');
    expect(mats[0].roughness).toBe(paint.roughness);
    expect(mats[0].metalness).toBe(paint.metalness);
    expect(mats[1]).toBe(light);
    expect(((second.scene.children[i] as THREE.Mesh).material as THREE.MeshStandardMaterial[])[0].color.equals(paint.color)).toBe(true);
  }
  expect(paint.color.getHexString()).toBe('ebebeb');
  first.setColour(null);
  expect(((first.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial[])[0].color.equals(paint.color)).toBe(true);
  expect(first.originalHex).toBe('#ebebeb');
  expect(() => first.setColour('red')).toThrow();
});

test('missing or ambiguous paint materials do not expose a misleading control', () => {
  const { root, paint } = fixture();
  paint.name = 'Paint trim';
  expect(createVehiclePaint(root, 'sedan')).toBeUndefined();
  paint.name = 'Paint';
  const other = paint.clone();
  other.color.set('#003300');
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), other));
  expect(createVehiclePaint(root, 'sedan')).toBeUndefined();
});
