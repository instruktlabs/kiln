/**
 * Solid diagnostics (delivery contract item 4).
 *
 * `geometryDiagnostics` reports a `solid` section: closed (no boundary edges), manifold (no
 * edge with more than two faces), orientation from consistent winding plus the sign of the
 * signed volume, and the signed volume itself. `requireSolid(part)` makes a build fail with
 * a closed repair message when a marked mesh is not a closed, manifold, outward solid.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  AuthoringDiagnosticError,
  authoringDiagnosticAdvice,
} from '../evaluator/authoring-diagnostic';
import { geometryDiagnostics } from '../geometry';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess, renderSceneToGLB } from '../render';
import { REQUIRE_SOLID_KEY, requireSolid } from '../require-solid';

function flipped(geometry: THREE.BufferGeometry, faces?: (face: number) => boolean) {
  const copy = geometry.clone();
  const index = copy.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    if (faces && !faces(i / 3)) continue;
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return copy;
}

describe('geometryDiagnostics solid section', () => {
  test('a box is closed, manifold and outward with its volume', () => {
    const { solid } = geometryDiagnostics(new THREE.BoxGeometry(1, 2, 3));
    expect(solid.closed).toBe(true);
    expect(solid.manifold).toBe(true);
    expect(solid.orientation).toBe('outward');
    expect(solid.signedVolume).toBeCloseTo(6, 6);
  });

  test('reversed winding reads inward and a partly reversed box reads mixed', () => {
    const inward = geometryDiagnostics(flipped(new THREE.BoxGeometry())).solid;
    expect(inward.orientation).toBe('inward');
    expect(inward.signedVolume).toBeCloseTo(-1, 6);
    const mixed = geometryDiagnostics(flipped(new THREE.BoxGeometry(), (face) => face < 2)).solid;
    expect(mixed.orientation).toBe('mixed');
  });

  test('an open tube is not closed', () => {
    const { solid } = geometryDiagnostics(new THREE.CylinderGeometry(1, 1, 2, 12, 1, true));
    expect(solid.closed).toBe(false);
    expect(solid.manifold).toBe(true);
  });
});

describe('requireSolid', () => {
  test('marks a part and is a sandbox helper', () => {
    const part = new THREE.Mesh(new THREE.BoxGeometry());
    expect(requireSolid(part)).toBe(part);
    expect(part.userData[REQUIRE_SOLID_KEY]).toEqual({ schemaVersion: 1 });
    expect(typeof buildSandboxGlobals().requireSolid).toBe('function');
    expect(() => requireSolid({} as THREE.Object3D)).toThrow(AuthoringDiagnosticError);
  });

  test('a closed outward solid builds; an open or inward one fails with the repair advice', async () => {
    const ok = new THREE.Group();
    requireSolid(ok.add(new THREE.Mesh(new THREE.BoxGeometry())));
    await expect(renderSceneToGLB(ok)).resolves.toBeDefined();

    for (const geometry of [
      new THREE.CylinderGeometry(1, 1, 2, 12, 1, true),
      flipped(new THREE.BoxGeometry()),
    ]) {
      const root = new THREE.Group();
      const part = new THREE.Mesh(geometry);
      part.name = 'Shell';
      root.add(part);
      requireSolid(root);
      try {
        await renderSceneToGLB(root);
        throw new Error('expected REQUIRE_SOLID');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthoringDiagnosticError);
        expect((error as AuthoringDiagnosticError).diagnostic).toBe('REQUIRE_SOLID');
        expect((error as Error).message).toContain('Shell');
      }
    }
    expect(authoringDiagnosticAdvice('REQUIRE_SOLID')).toContain('requireSolid');
  });

  test('a sandbox program fails the build with the closed diagnostic', async () => {
    const failing = renderGLBInProcess(`const meta={name:'Leaky'};
function build(){
  const root=createRoot('Root');
  const tube=createPart('Tube',new THREE.CylinderGeometry(0.2,0.2,1,12,1,true),gameMaterial('#888888'),{parent:root,position:[0,0.5,0]});
  requireSolid(tube);
  return root;
}`);
    await expect(failing).rejects.toMatchObject({ diagnostic: 'REQUIRE_SOLID' });
  });
});
