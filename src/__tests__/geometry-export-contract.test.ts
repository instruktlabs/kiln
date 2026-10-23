import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { inspectGeometryExport } from '../geometry-export';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { renderSceneToGLB } from '../render';
import { validateFinalGlbBytes } from '../qa/gltf';

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
    const result = await renderSceneToGLB(root, {
      dedup: false,
      optimize: 'off',
      instance: 'off',
    });
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

  for (const gltfExporter of ['legacy', 'three'] as const)
    it(`${gltfExporter} writes vertex colours and lowercase underscore author attributes`, async () => {
      const { root, geometry } = fixture();
      const color = [1, 0, 0, 1, 0, 1, 0, 0.5, 0, 0, 1, 0.25];
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
      geometry.setAttribute('_wet', new THREE.Float32BufferAttribute([0, 1, 1], 1));
      geometry.setAttribute('_flow_dir', new THREE.Float32BufferAttribute([1, 0, 0, 1, 1, 1], 2));
      geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0.5, 0, 1, 0.5, 0, 1], 2));
      const result = await renderSceneToGLB(root, {
        dedup: false,
        optimize: 'off',
        instance: 'off',
        gltfExporter,
      });
      expect(result.warnings.join('\n')).not.toContain('EXPORT_ATTRIBUTE_UNSUPPORTED');
      const doc = await new WebIO().readBinary(result.bytes);
      const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
      const values = (semantic: string) => {
        const accessor = primitive.getAttribute(semantic);
        if (!accessor) throw new Error(`missing ${semantic}`);
        return { type: accessor.getType(), values: Array.from(accessor.getArray()!) };
      };
      expect(values('COLOR_0')).toEqual({ type: 'VEC4', values: color });
      expect(values('_WET')).toEqual({ type: 'SCALAR', values: [0, 1, 1] });
      expect(values('_FLOW_DIR')).toEqual({ type: 'VEC2', values: [1, 0, 0, 1, 1, 1] });
      expect(values('TEXCOORD_1')).toEqual({ type: 'VEC2', values: [0.5, 0, 1, 0.5, 0, 1] });
    });

  it('legacy samples a channel-1 occlusion map through TEXCOORD_1', async () => {
    const { root, geometry } = fixture();
    const mesh = root.children[0] as THREE.Mesh;
    const ao = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    ao.needsUpdate = true;
    ao.channel = 1;
    (mesh.material as THREE.MeshStandardMaterial).aoMap = ao;
    // Pinned: CI also runs the suite with KILN_GLTF_EXPORTER=three, which names the set uv2.
    const legacy = { gltfExporter: 'legacy' } as const;
    await expect(renderSceneToGLB(root, legacy)).rejects.toThrow(
      'CustomPanel: aoMap samples uv1, which the geometry lacks.',
    );
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    const result = await renderSceneToGLB(root, {
      ...legacy,
      dedup: false,
      optimize: 'off',
      instance: 'off',
    });
    const doc = await new WebIO().readBinary(result.bytes);
    expect(doc.getRoot().listMaterials()[0]!.getOcclusionTextureInfo()!.getTexCoord()).toBe(1);
    ao.channel = 2;
    expect((await renderSceneToGLB(root, legacy)).warnings).toContain(
      'EXPORT_ATTRIBUTE_UNSUPPORTED CustomPanel: aoMap UV channel 2 is not preserved by the GLB bridge.',
    );
  });

  it('names author attributes that cannot round-trip through GLTFLoader', async () => {
    const { root, geometry } = fixture();
    geometry.setAttribute('_Wet', new THREE.Float32BufferAttribute([0, 1, 1], 1));
    const result = await renderSceneToGLB(root);
    expect(result.warnings).toContain(
      'EXPORT_ATTRIBUTE_UNSUPPORTED CustomPanel: _Wet is not preserved by the GLB bridge. Author attributes use a lowercase name such as _wet (exported as _WET) with 1 to 4 float components.',
    );
    geometry.deleteAttribute('_Wet');
    geometry.setAttribute('_wet', new THREE.Float32BufferAttribute(new Array(15).fill(0), 5));
    await expect(renderSceneToGLB(root)).rejects.toThrow(
      'CustomPanel: _wet requires 3 vertices with 1 or 2 or 3 or 4 components each.',
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
    const result = await renderSceneToGLB(root, {
      dedup: false,
      optimize: 'off',
      instance: 'off',
    });
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
    const loft = {
      code: 'LOFT_SELF_INTERSECTION_UNCHECKED',
      message: 'Loft advisory.',
    };
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

describe('non-unit normals on export', () => {
  // A cup whose profile starts and ends a millimetre from the axis, as in the Cove pass.
  const cup = () => {
    const points = [
      [0.001, 0],
      [0.04, 0],
      [0.045, 0.06],
      [0.03, 0.09],
      [0.001, 0.09],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return mergeVertices(new THREE.LatheGeometry(points, 24));
  };
  const lengths = (values: ArrayLike<number>) =>
    Array.from({ length: values.length / 3 }, (_, i) =>
      Math.hypot(values[i * 3]!, values[i * 3 + 1]!, values[i * 3 + 2]!),
    );

  for (const exporter of ['legacy', 'three'] as const) {
    it(`normalises raw LatheGeometry normals with one note naming the part (${exporter})`, async () => {
      const geometry = cup();
      const before = Array.from(geometry.getAttribute('normal').array);
      const bad = lengths(before).filter((length) => Math.abs(length - 1) > 0.0005).length;
      expect(bad).toBeGreaterThan(0);
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      mesh.name = 'LampBase';
      root.add(mesh);
      const result = await renderSceneToGLB(root, {
        dedup: false,
        optimize: 'off',
        instance: 'off',
        gltfExporter: exporter,
      });
      const notes = result.warnings.filter((warning) => warning.includes('normal'));
      expect(notes).toEqual([
        `LampBase: NORMALS_NORMALISED ${bad} non-unit normals were scaled to unit length on export.`,
      ]);
      const doc = await new WebIO().readBinary(result.bytes);
      const written = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('NORMAL')!;
      for (const length of lengths(written.getArray()!))
        expect(Math.abs(length - 1)).toBeLessThan(0.0005);
      expect(Array.from(geometry.getAttribute('normal').array)).toEqual(before);
      const report = await validateFinalGlbBytes(result.bytes);
      expect(report.issues.messages.map((issue) => issue.code)).not.toContain(
        'ACCESSOR_VECTOR3_NON_UNIT',
      );
    });
  }

  it('fails on a zero-length normal, naming the part and a remedy', async () => {
    const { root, geometry } = fixture();
    geometry.getAttribute('normal').setXYZ(1, 0, 0, 0);
    await expect(renderSceneToGLB(root)).rejects.toThrow(
      'CustomPanel: normal at vertex 1 has zero length',
    );
    await expect(renderSceneToGLB(root)).rejects.toThrow('revolveGeo');
  });

  it('writes unit normals byte for byte', async () => {
    const { root, geometry } = fixture();
    const result = await renderSceneToGLB(root, {
      dedup: false,
      optimize: 'off',
      instance: 'off',
    });
    expect(result.warnings.filter((warning) => warning.includes('NORMALS_NORMALISED'))).toEqual([]);
    const doc = await new WebIO().readBinary(result.bytes);
    const written = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('NORMAL')!;
    const bytes = (array: ArrayLike<number> & ArrayBufferView) =>
      Array.from(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    expect(bytes(written.getArray()!)).toEqual(
      bytes(geometry.getAttribute('normal').array as Float32Array),
    );
  });
});
