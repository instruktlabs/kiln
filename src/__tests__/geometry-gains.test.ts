/**
 * Phase 5.1 geometry gains: snapTo contact resolution, gap-vector fix hints on
 * floating-part warnings, the category orientation advisory, settleContacts,
 * and the upgraded static tri estimates (loops, gearGeo, subdivide).
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { buildSandboxGlobals, snapTo } from '../primitives';
import {
  executeKilnCode,
  inspectSceneStructure,
  renderSceneToGLB,
  settleContacts,
} from '../render';
import { validate } from '../validation';

const FLOATER_CODE = `
const meta = { name: 'floaty', category: 'prop' };
function build() {
  const root = createRoot('Root');
  createPart('Mesh_Base', boxGeo(1, 1, 1), gameMaterial('#888888'), { parent: root, position: [0, 0.5, 0] });
  // float bottom at 1.14-0.1=1.04 vs base top at 1.0 → a 4cm gap (settleable)
  createPart('Mesh_Float', boxGeo(0.2, 0.2, 0.2), gameMaterial('#ff0000'), { parent: root, position: [0, 1.14, 0] });
  return root;
}
`;

describe('snapTo', () => {
  test('translates a floating part into contact with its host', () => {
    const g = buildSandboxGlobals();
    void g; // sandbox registration sanity is covered by the parity test
    const host = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    host.position.set(0, 0.5, 0);
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial(),
    );
    part.position.set(0, 1.8, 0); // 0.7 above the host top
    const scene = new THREE.Object3D();
    scene.add(host, part);

    snapTo(part, host);
    const a = new THREE.Box3().setFromObject(part);
    const b = new THREE.Box3().setFromObject(host);
    expect(a.intersectsBox(b)).toBe(true);
  });

  test('is a no-op when already in contact', () => {
    const host = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4));
    part.position.set(0, 0.6, 0); // overlapping
    const scene = new THREE.Object3D();
    scene.add(host, part);
    const before = part.position.clone();
    snapTo(part, host);
    expect(part.position.distanceTo(before)).toBe(0);
  });
});

describe('floating-part fix hints', () => {
  test('warning carries the minimal gap vector and the snapTo suggestion', async () => {
    const { root } = await executeKilnCode(FLOATER_CODE);
    const warnings = inspectSceneStructure(root);
    const floatWarning = warnings.find((w) => w.includes('Floating parts'));
    expect(floatWarning).toBeDefined();
    expect(floatWarning).toContain('Mesh_Float');
    expect(floatWarning).toContain('shift');
    expect(floatWarning).toContain('snapTo');
    // 4cm downward gap → the hint vector's Y component is -0.040.
    expect(floatWarning).toContain('-0.040');
  });

  test('many floaters share one bounded warning: fix text for the first few, names for the rest', async () => {
    // Forty separated boxes: 47 of these on a real asset cost 8,600 characters per warning.
    const { root } = await executeKilnCode(`
      const meta = { name: 'scattered' };
      function build() {
        const root = createRoot('Root');
        for (let i = 0; i < 40; i++)
          createPart('P' + i, boxGeo(0.1, 0.1, 0.1), gameMaterial('#888888'), { parent: root, position: [i * 0.2, 0, 0] });
        return root;
      }
    `);
    const warnings = inspectSceneStructure(root).filter((w) => w.includes('Floating parts'));
    expect(warnings).toHaveLength(1);
    const [warning] = warnings;
    expect(warning!.length).toBeLessThan(2000);
    // Six per-part fixes verbatim, then names only, bounded, with the count of the rest.
    expect(warning!.match(/ — Fix: shift /g)).toHaveLength(6);
    expect(warning).toContain('"Mesh_P0" by [0.100, 0.000, 0.000] toward "Mesh_P1"');
    expect(warning).toContain('+34 more floating: Mesh_P6, Mesh_P7');
    expect(warning).toContain('Mesh_P29, +10 more');
    expect(warning).not.toContain('Mesh_P30');
    expect(warning).toContain('snapTo(part, hostPart)');
  });
});

describe('orientation advisory', () => {
  test('flags a sideways vehicle (Z-dominant), passes an X-forward one', async () => {
    const sideways = await executeKilnCode(`
      const meta = { name: 'sideways' };
      function build() {
        const root = createRoot('Root');
        createPart('Mesh_Hull', boxGeo(0.8, 0.5, 3.0), gameMaterial('#445544'), { parent: root, position: [0, 0.25, 0] });
        return root;
      }
    `);
    const w1 = inspectSceneStructure(sideways.root, { category: 'vehicle' });
    expect(w1.some((w) => w.includes('Orientation'))).toBe(true);

    const forward = await executeKilnCode(`
      const meta = { name: 'forward' };
      function build() {
        const root = createRoot('Root');
        createPart('Mesh_Hull', boxGeo(3.0, 0.5, 0.8), gameMaterial('#445544'), { parent: root, position: [0, 0.25, 0] });
        return root;
      }
    `);
    const w2 = inspectSceneStructure(forward.root, { category: 'vehicle' });
    expect(w2.some((w) => w.includes('Orientation'))).toBe(false);
    // No category → no orientation check at all.
    expect(inspectSceneStructure(sideways.root).some((w) => w.includes('Orientation'))).toBe(false);
  });

  test('neutral render does not infer a vehicle requirement from source labels', async () => {
    const sideways = await executeKilnCode(`
      const meta = { name: 'sideways', category: 'prop' };
      function build() {
        const root = createRoot('Root');
        const frame = createVehicleFrame('VehicleFrame', {
          axles: [{ id: 'front', position: [0.3, 0.35, 0] }, { id: 'rear', position: [-0.3, 0.35, 0] }],
          parent: root,
        });
        createPart('Mesh_Hull', boxGeo(0.8, 0.5, 3.0), gameMaterial('#445544'), { parent: frame.root, position: [0, 0.5, 0] });
        const rubber = gameMaterial('#111111', { roughness: 0.95 });
        const metal = gameMaterial('#888888', { metalness: 0.8 });
        const geometries = createWheelGeometrySet(0.35, 0.18);
        for (const [index, x] of [['front', 0.3], ['rear', -0.3]]) {
          for (const [side, z] of [['left', -1.6], ['right', 1.6]]) {
            createWheelAssembly(index + side, { tire: rubber, rim: metal }, {
              radius: 0.35, width: 0.18, side, index,
              position: [x, 0.35, z], steering: index === 'front', geometries, parent: frame.root,
            });
          }
        }
        return root;
      }
    `);
    const rendered = await renderSceneToGLB(sideways.root);

    expect(rendered.warnings.some((warning) => warning.includes('Orientation'))).toBe(false);
    expect(rendered.qaReport).not.toHaveProperty('category');
    expect(rendered.qaReport.acceptance).toBe('accepted');
    expect(rendered.qaReport.dimensions.runtimeCost.status).toBe('pass');
    expect(rendered.qaReport.dimensions.runtimeCost.metrics?.['instanceabilityGrade']).toBe(
      rendered.instanceability?.grade,
    );
    expect(rendered.qaReport.dimensions.exportIntegrity.metrics?.['gltfErrors']).toBe(0);
  });
});

describe('settleContacts', () => {
  test('closes a small gap and reports the moved part; leaves big gaps alone', async () => {
    const { root } = await executeKilnCode(FLOATER_CODE); // 4cm gap
    const settled = settleContacts(root, { maxGap: 0.05 });
    expect(settled).toEqual(['Mesh_Mesh_Float']);
    expect(inspectSceneStructure(root).some((w) => w.includes('Floating parts'))).toBe(false);

    const far = await executeKilnCode(`
      const meta = { name: 'far' };
      function build() {
        const root = createRoot('Root');
        createPart('Mesh_Base', boxGeo(1, 1, 1), gameMaterial('#888888'), { parent: root, position: [0, 0.5, 0] });
        createPart('Mesh_Far', boxGeo(0.2, 0.2, 0.2), gameMaterial('#ff0000'), { parent: root, position: [0, 3, 0] });
        return root;
      }
    `);
    expect(settleContacts(far.root, { maxGap: 0.05 })).toEqual([]);
  });
});

describe('tri estimate upgrades', () => {
  // These used to observe the estimator through the TRI_BUDGET_EXCEEDED advisory,
  // which no longer exists — Kiln has no triangle budget on purpose. The estimate
  // itself is still computed and is now surfaced directly on the result as
  // information, so these assert on the number rather than on a verdict about it.
  const wrap = (body: string) => `
    const meta = { name: 'est', category: 'prop' };
    function build() {
      const root = createRoot('Root');
      ${body}
      return root;
    }
  `;

  test('for-loop literal bounds multiply the estimate', () => {
    // 8 cylinders at 16 segs = 8 * 64 = 512 estimated tris (vs 64 unscaled).
    const r = validate(
      wrap(`for (let i = 0; i < 8; i++) {
        createPart('P' + i, cylinderGeo(0.1, 0.1, 1, 16), gameMaterial('#999999'), { parent: root });
      }`),
      { category: 'vfx' },
    );
    expect(r.valid).toBe(true);
    expect(r.estimatedTris).toBe(512);

    // 50 spheres at 32x16 -> 50 * 1024 = 51200. Dense, and entirely unremarkable:
    // it validates clean and draws no advisory of any kind.
    const heavy = validate(
      wrap(`for (let i = 0; i < 50; i++) {
        createPart('S' + i, sphereGeo(0.5, 32, 16), gameMaterial('#999999'), { parent: root });
      }`),
      { category: 'prop' },
    );
    expect(heavy.valid).toBe(true);
    expect(heavy.estimatedTris).toBe(51200);
    expect(heavy.warnings.some((w) => /triangle|budget/i.test(w.message))).toBe(false);
  });

  test('gearGeo and subdivide contribute estimates', () => {
    const r = validate(
      wrap(`
        createPart('Gear', gearGeo({ teeth: 64 }), gameMaterial('#999999'), { parent: root }); // ~2048
        const blob = subdivide(sphereGeo(1, 16, 12), 3); // 384 base * 64 -> ~24576
        createPart('Blob', blob, gameMaterial('#999999'), { parent: root });
      `),
      { category: 'vfx' },
    );
    expect(r.valid).toBe(true);
    // Both call sites contribute: the gear's teeth-driven estimate and the
    // subdivision's 4^n multiplier.
    expect(r.estimatedTris).toBeGreaterThan(22500);
    expect(r.warnings.some((w) => /triangle|budget/i.test(w.message))).toBe(false);
  });
});
