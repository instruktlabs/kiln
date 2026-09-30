import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { inspectGeometryExport } from '../geometry-export';
import { renderSceneToGLB } from '../render';

function fixture() {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute(
    'tangent',
    new THREE.Float32BufferAttribute([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4),
  );
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  mesh.name = 'CustomPanel';
  root.add(mesh);
  return { root, geometry };
}

describe('custom mesh export contract', () => {
  it('round trips supported indexed attributes', async () => {
    const { root, geometry } = fixture();
    const result = await renderSceneToGLB(root, { dedup: false, optimize: 'off', instance: 'off' });
    const doc = await new WebIO().readBinary(result.bytes);
    const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    for (const [attribute, semantic] of [
      ['position', 'POSITION'],
      ['normal', 'NORMAL'],
      ['uv', 'TEXCOORD_0'],
      ['tangent', 'TANGENT'],
    ]) {
      expect(Array.from(primitive.getAttribute(semantic!)!.getArray()!)).toEqual(
        Array.from(geometry.getAttribute(attribute!).array),
      );
    }
    expect(Array.from(primitive.getIndices()!.getArray()!)).toEqual([0, 1, 2]);
  });

  it('identifies dropped attributes and rejects them in strict mode', async () => {
    const { root, geometry } = fixture();
    geometry.setAttribute(
      'customDisplacement',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2),
    );
    const result = await renderSceneToGLB(root);
    expect(
      result.warnings.some(
        (warning) =>
          warning.includes('CustomPanel') &&
          warning.includes('customDisplacement') &&
          warning.includes('EXPORT_ATTRIBUTE_UNSUPPORTED'),
      ),
    ).toBe(true);
    await expect(renderSceneToGLB(root, { geometryPolicy: 'strict' })).rejects.toThrow(
      'customDisplacement',
    );
  });

  it('rejects nonfinite positions before writing invalid bytes', async () => {
    const { root, geometry } = fixture();
    geometry.getAttribute('position').setX(0, Number.NaN);
    await expect(renderSceneToGLB(root)).rejects.toThrow('CustomPanel: position');
  });

  it('preserves interleaved source attributes using their stride and offset', async () => {
    const { root, geometry } = fixture();
    const data = new THREE.InterleavedBuffer(
      new Float32Array([0, 0, 0, 99, 1, 0, 0, 99, 0, 1, 0, 99]),
      4,
    );
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    const result = await renderSceneToGLB(root, { dedup: false, optimize: 'off', instance: 'off' });
    const doc = await new WebIO().readBinary(result.bytes);
    expect(
      Array.from(
        doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!.getArray()!,
      ),
    ).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
});

describe('geometry notes', () => {
  function noted(name: string, notes: unknown[], key = 'kilnGeometryWarnings') {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.userData[key] = notes;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = name;
    return mesh;
  }

  it('reports a note repeated across meshes once, naming a few of them', () => {
    const loft = { code: 'LOFT_SELF_INTERSECTION_UNCHECKED', message: 'Loft advisory.' };
    const root = new THREE.Group();
    root.add(noted('Rib_0', [loft]));
    root.add(noted('Turn_A', [{ code: 'SWEEP_TIGHT_TURN', message: 'Station 3 turns.' }]));
    root.add(noted('Rib_1', [loft]));
    root.add(noted('Turn_B', [{ code: 'SWEEP_TIGHT_TURN', message: 'Station 7 turns.' }]));
    for (let i = 2; i < 17; i++) root.add(noted(`Rib_${i}`, [loft]));
    for (let i = 0; i < 3; i++) root.add(noted('Blade', [{ code: 'CODE_ONLY' }]));
    root.add(noted('Blade', ['Legacy string note.'], 'kilnAttributeWarnings'));
    root.add(noted('Solo', [{ code: 'SOLO_NOTE', message: 'Only once.' }]));
    root.add(noted('Blade', ['Legacy string note.'], 'kilnAttributeWarnings'));
    root.add(noted('Hull', ['Legacy string note.'], 'kilnAttributeWarnings'));
    expect(inspectGeometryExport(root)).toEqual([
      'LOFT_SELF_INTERSECTION_UNCHECKED (17 meshes: Rib_0, Rib_1, Rib_2, +14 more): Loft advisory.',
      'Turn_A: SWEEP_TIGHT_TURN Station 3 turns.',
      'Turn_B: SWEEP_TIGHT_TURN Station 7 turns.',
      'CODE_ONLY (3 meshes: Blade x3)',
      '3 meshes (Blade x2, Hull): Legacy string note.',
      'Solo: SOLO_NOTE Only once.',
    ]);
  });

  it('keeps export attribute warnings in place around grouped notes', () => {
    const note = { code: 'EXPERIMENTAL_IMPLICIT_SURFACE', message: 'Sampled.' };
    const root = new THREE.Group();
    root.add(noted('Blob_A', [note]));
    const custom = noted('Blob_B', [note]);
    custom.geometry.setAttribute(
      'customDisplacement',
      new THREE.Float32BufferAttribute(
        new Float32Array(custom.geometry.getAttribute('position').count),
        1,
      ),
    );
    root.add(custom);
    expect(inspectGeometryExport(root)).toEqual([
      'EXPERIMENTAL_IMPLICIT_SURFACE (2 meshes: Blob_A, Blob_B): Sampled.',
      'EXPORT_ATTRIBUTE_UNSUPPORTED Blob_B: customDisplacement is not preserved by the GLB bridge.',
    ]);
  });
});
