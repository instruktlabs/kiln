// SPDX-License-Identifier: MIT
// Fix round 3 item 0: the bridge's expansion-joint plates (review 3) lie 1.5 mm above the Roadway, which runs
// on beneath them, so at range the depth buffer cannot separate the two and the plates blink. The scene sets
// a polygon offset on their material (data/layout.json bridge.jointPlates) when the bridge loads; the GLB is
// not changed. The material name is the GLB's; nothing else in the bridge uses it.
import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { LAYOUT } from '../../src/data';
import { offsetJointPlates } from '../../src/world/bridge';

describe('joint plates', () => {
  test('layout.json names the plates\' material and a polygon offset toward the camera', () => {
    const j = LAYOUT.bridge.jointPlates;
    expect(j.material).toBe('JointSteel');
    expect(j.polygonOffset.factor).toBeLessThan(0);
    expect(j.polygonOffset.units).toBeLessThan(0);
  });

  test('only the JointSteel material takes the offset, once however many meshes share it', () => {
    const root = new Group(), steel = new MeshStandardMaterial({ name: 'JointSteel' }), asphalt = new MeshStandardMaterial({ name: 'Asphalt' });
    const geometry = new BoxGeometry();
    root.add(new Mesh(geometry, steel), new Mesh(geometry, steel), new Mesh(geometry, asphalt));
    const nested = new Group(); nested.add(new Mesh(geometry, [asphalt, steel])); root.add(nested);
    expect(offsetJointPlates(root)).toBe(1);
    const { factor, units } = LAYOUT.bridge.jointPlates.polygonOffset;
    expect(steel.polygonOffset).toBe(true);
    expect(steel.polygonOffsetFactor).toBe(factor);
    expect(steel.polygonOffsetUnits).toBe(units);
    expect(asphalt.polygonOffset).toBe(false);
    expect(asphalt.polygonOffsetFactor).toBe(0);
  });

  test('a bridge without the material is left alone', () => {
    const root = new Group(); root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: 'Concrete' })));
    expect(offsetJointPlates(root)).toBe(0);
  });
});
