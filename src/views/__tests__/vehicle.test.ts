import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { stampSemanticMetadataV1 } from '../../contracts';
import { createAssetRequirementsV1 } from '../../contracts/requirements';
import { createAssetRequirementsStore } from '../../requirements-store';
import { renderSceneToGLB } from '../../render';
import { createVehicleFrame, createWheelAssembly } from '../../vehicle';
import { defineLod } from '../../lod';
import {
  captureVehicleDiagnosticViews,
  createVehicleDiagnosticOverlay,
  describeVehicleDiagnostics,
} from '../vehicle';

function fixture() {
  const frame = createVehicleFrame('DiagnosticCar');
  frame.root.position.set(2, 1, -4);
  frame.root.rotation.y = 0.55;
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.6, 1.4),
    new THREE.MeshStandardMaterial(),
  );
  chassis.name = 'Chassis';
  chassis.position.y = 0.75;
  stampSemanticMetadataV1(chassis, { roles: ['chassis.main'] });
  frame.root.add(chassis);
  for (const [index, x] of [
    ['front', 1],
    ['rear', -1],
  ] as const) {
    for (const side of ['left', 'right'] as const) {
      createWheelAssembly(
        'Wheel',
        {
          tire: new THREE.MeshStandardMaterial(),
          rim: new THREE.MeshStandardMaterial(),
        },
        {
          radius: 0.45,
          width: 0.18,
          side,
          index,
          position: [x, 0.45, side === 'left' ? -0.75 : 0.75],
          steering: index === 'front',
          parent: frame.root,
        },
      );
    }
  }
  frame.root.updateMatrixWorld(true);
  return frame.root;
}

describe('vehicle diagnostics', () => {
  test('production diagnostic sheets draw the default LOD0 scene and restore source tiers', async () => {
    const root = fixture();
    const expected = captureVehicleDiagnosticViews(root).map((view) => view.png);
    const high = new THREE.Group();
    high.name = 'Car_LOD0';
    high.add(...[...root.children]);
    const low = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshStandardMaterial());
    low.name = 'Car_LOD1';
    root.add(high, low);
    defineLod([high, low], { screenCoverage: [0.2, 0] });
    const requirements = createAssetRequirementsStore().host.bind(
      { taskId: 'lod-diagnostics', lineageId: 'mobility' },
      createAssetRequirementsV1({
        requirements: { mobility: { state: 'requested', value: { wheelCount: 4 } } },
      }),
      { actor: 'owner', source: 'brief', reason: 'Mobility inspection' },
    );
    const result = await renderSceneToGLB(root, { requirements });
    expect(result.diagnosticViews?.every((view, i) => view.png.equals(expected[i]!))).toBe(true);
    expect(root.children).toEqual([high, low]);
    expect(low.parent).toBe(root);
    expect(low.visible).toBe(true);
  });
  test('describes +X, chassis, axle, wheel, support, underbody, and section evidence', () => {
    const descriptor = describeVehicleDiagnostics(fixture());
    expect(descriptor.forwardArrow).toEqual({ start: [0, 0, 0], end: [1, 0, 0] });
    expect(descriptor.chassisBox?.min[0]).toBeCloseTo(-1.4, 6);
    expect(descriptor.chassisBox?.min[1]).toBeCloseTo(0.45, 6);
    expect(descriptor.chassisBox?.min[2]).toBeCloseTo(-0.7, 6);
    expect(descriptor.chassisBox?.max[0]).toBeCloseTo(1.4, 6);
    expect(descriptor.chassisBox?.max[1]).toBeCloseTo(1.05, 6);
    expect(descriptor.chassisBox?.max[2]).toBeCloseTo(0.7, 6);
    expect(descriptor.axles).toHaveLength(2);
    expect(descriptor.wheels).toHaveLength(4);
    expect(descriptor.wheels.every((wheel) => wheel.axle[2] > 0.999)).toBe(true);
    expect(descriptor.supportPlaneY).toBeCloseTo(0, 6);
    expect(descriptor.views.map((view) => view.id)).toEqual(
      expect.arrayContaining(['vehicle.front-direction', 'vehicle.axles.top', 'vehicle.underbody']),
    );
    expect(
      descriptor.views.filter((view) => view.id.startsWith('vehicle.wheel-section.')),
    ).toHaveLength(2);
  });

  test('creates a separate renderable overlay without mutating the source', () => {
    const root = fixture();
    const before = root.children.map((child) => ({
      child,
      visible: child.visible,
      position: child.position.clone(),
      quaternion: child.quaternion.clone(),
    }));
    const overlay = createVehicleDiagnosticOverlay(root);
    expect(overlay.parent).toBeNull();
    expect(overlay.getObjectByName('Diagnostic_Forward_+X')).toBeDefined();
    expect(overlay.getObjectByName('Diagnostic_ChassisBox')).toBeDefined();
    expect(overlay.getObjectByName('Diagnostic_SupportPlane')).toBeDefined();
    expect(
      overlay.children.filter((child) => child.name.startsWith('Diagnostic_Axle_')),
    ).toHaveLength(2);
    expect(
      overlay.children.filter((child) => child.name.startsWith('Diagnostic_Wheel_')),
    ).toHaveLength(4);
    for (const snapshot of before) {
      expect(snapshot.child.visible).toBe(snapshot.visible);
      expect(snapshot.child.position).toEqual(snapshot.position);
      expect(snapshot.child.quaternion.angleTo(snapshot.quaternion)).toBeCloseTo(0, 8);
    }
  });

  test('captures underbody and one wheel close-up through the production render path', async () => {
    const root = fixture();
    const requirements = createAssetRequirementsStore().host.bind(
      { taskId: 'diagnostics', lineageId: 'mobility' },
      createAssetRequirementsV1({
        requirements: {
          mobility: { state: 'requested', value: { wheelCount: 4 } },
        },
      }),
      { actor: 'owner', source: 'brief', reason: 'Mobility inspection' },
    );
    const rootSnapshot = {
      position: root.position.clone(),
      quaternion: root.quaternion.clone(),
      scale: root.scale.clone(),
      children: [...root.children],
    };
    const focused = captureVehicleDiagnosticViews(root, 72);
    expect(focused.map((capture) => capture.kind)).toEqual(['underbody', 'wheel-section']);
    expect(focused.every((capture) => capture.png.byteLength > 100)).toBe(true);
    expect(focused[1]?.id).toContain('wheel.assembly.right.front');
    const underbodyRoles = new Set(
      focused[0]?.regions.flatMap((region) => region.semanticRoles) ?? [],
    );
    expect(underbodyRoles.size).toBeGreaterThan(0);
    for (const role of [
      'diagnostic.vehicle.forward',
      'diagnostic.vehicle.chassis',
      'diagnostic.vehicle.support-plane',
    ]) {
      expect(underbodyRoles.has(role)).toBe(true);
    }
    expect([...underbodyRoles].some((role) => role.startsWith('diagnostic.vehicle.axle.'))).toBe(
      true,
    );
    expect([...underbodyRoles].some((role) => role.startsWith('diagnostic.vehicle.wheel.'))).toBe(
      true,
    );

    const neutral = await renderSceneToGLB(root);
    expect(neutral.diagnosticViews).toBeUndefined();
    const rendered = await renderSceneToGLB(root, { requirements });
    expect(rendered.diagnosticViews?.map((capture) => capture.kind)).toEqual([
      'underbody',
      'wheel-section',
    ]);
    expect(rendered.bytes).toEqual(neutral.bytes);
    expect(rendered.diagnosticViews?.every((capture) => capture.png.byteLength > 100)).toBe(true);
    expect(root.position).toEqual(rootSnapshot.position);
    expect(root.quaternion.angleTo(rootSnapshot.quaternion)).toBeCloseTo(0, 8);
    expect(root.scale).toEqual(rootSnapshot.scale);
    expect(root.children).toEqual(rootSnapshot.children);
    expect(root.children.every((child) => child.parent === root)).toBe(true);
  });
});
