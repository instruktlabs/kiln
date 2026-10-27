/**
 * Material names, authoring to exported bytes.
 *
 * A consuming runtime that batches draws keys on material *instance* identity, so
 * ten GLBs that share a finish still arrive as ten material instances and nothing
 * merges. The fix on that side is a registry that swaps each loaded mesh's material
 * for one canonical instance, and that needs a stable authored key in the file.
 *
 * Both exporters already write `material.name` when one is set, and the name
 * survives the sandbox, dedup and every optimize level — the `carries` tests below
 * pin that, because it is the guarantee the registry rests on. What was missing is
 * any way for an author to SET a name: the texture helpers take `name`, the material
 * helpers did not, so a delivered asset's materials were unnamed and the author's
 * distinctions ("parkerised steel", "polymer furniture") were lost on the way out.
 */
import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { basicMaterial, gameMaterial, glassMaterial, lambertMaterial } from '../primitives';
import { foliageMaterial, pbrMaterial } from '../textures';
import { executeKilnCode, renderSceneToGLB } from '../render';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';

const io = () => new WebIO().registerExtensions(ALL_EXTENSIONS);

const PROGRAM = `
function build() {
  const root = createRoot('Rifle');
  const steel = gameMaterial(0x25342a, { metalness: 0.58, roughness: 0.58, name: 'ParkerisedSteel' });
  const poly = pbrMaterial({ albedo: 0x050605, roughness: 0.82, metalness: 0, name: 'PolymerFurniture' });
  createPart('Barrel', boxGeo(1, 0.1, 0.1), steel, { parent: root });
  createPart('Handguard', boxGeo(0.3, 0.2, 0.1), poly, { parent: root, position: [0.5, 0, 0] });
  return root;
}
`;

test('every material helper takes an author name', () => {
  expect(gameMaterial(0x25342a, { name: 'ParkerisedSteel' }).name).toBe('ParkerisedSteel');
  expect(pbrMaterial({ albedo: 0x050605, name: 'PolymerFurniture' }).name).toBe('PolymerFurniture');
  expect(basicMaterial(0xffffff, { name: 'Decal' }).name).toBe('Decal');
  expect(glassMaterial(0x66ccff, { name: 'ScopeLens' }).name).toBe('ScopeLens');
  expect(lambertMaterial(0x2a4d14, { name: 'Webbing' }).name).toBe('Webbing');
  expect(foliageMaterial(0x2a4d14, { name: 'Frond' }).name).toBe('Frond');
  // Omitting the option leaves three.js's own empty default, which both exporters
  // read as "no name" rather than writing an empty string.
  expect(gameMaterial(0x25342a).name).toBe('');
});

// The bound matches the portable material spec's own, so the two naming routes agree.
test('a material name is bounded and free of control characters', () => {
  for (const bad of ['', 'a'.repeat(201), 'Steel\u0000', 'Steel\nPolymer', 'Steel\u007f']) {
    expect(() => gameMaterial(0x25342a, { name: bad })).toThrow(AuthoringDiagnosticError);
    expect(() => pbrMaterial({ albedo: 0x25342a, name: bad })).toThrow(AuthoringDiagnosticError);
  }
  expect(gameMaterial(0x25342a, { name: 'a'.repeat(200) }).name).toBe('a'.repeat(200));
  // A non-string from a half-remembered API fails closed rather than stringifying.
  expect(() => gameMaterial(0x25342a, { name: 7 as unknown as string })).toThrow(
    AuthoringDiagnosticError,
  );
});

for (const exporter of ['legacy', 'three'] as const) {
  test(`${exporter} exporter carries authored material names into the GLB`, async () => {
    const { root } = await executeKilnCode(PROGRAM);
    const result = await renderSceneToGLB(root, { gltfExporter: exporter, derivative: true });
    const doc = await io().readBinary(result.bytes);
    expect(
      doc
        .getRoot()
        .listMaterials()
        .map((m) => m.getName())
        .sort(),
    ).toEqual(['ParkerisedSteel', 'PolymerFurniture']);
  });

  test(`${exporter} exporter carries names at every optimize level`, async () => {
    // The three finishes a delivered M16A1 actually carried, which arrived unnamed.
    // The consolidating passes (dedup, palette, rigid merge) keep all three names,
    // so a destination registry can key on them whatever optimize level shipped.
    const finishes = [
      ['ParkerisedSteel', 0x25342a, 0.58, 0.58],
      ['PolymerFurniture', 0x050605, 0, 0.82],
      ['Recesses', 0x010102, 0.1, 0.95],
    ] as const;
    for (const optimize of ['off', 'auto', 'palette', 'full'] as const) {
      const root = new THREE.Group();
      root.name = 'Rifle';
      finishes.forEach(([name, color, metalness, roughness], i) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.1, 0.1),
          gameMaterial(color, { metalness, roughness, name }),
        );
        mesh.name = `Part${i}`;
        mesh.position.set(i * 0.5, 0, 0);
        root.add(mesh);
      });
      const result = await renderSceneToGLB(root, {
        gltfExporter: exporter,
        derivative: true,
        optimize,
      });
      const doc = await io().readBinary(result.bytes);
      expect(
        doc
          .getRoot()
          .listMaterials()
          .map((m) => m.getName()),
      ).toEqual(finishes.map(([name]) => name));
    }
  });
}
