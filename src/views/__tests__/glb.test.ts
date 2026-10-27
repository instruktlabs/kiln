import { createHash } from 'node:crypto';
import { describe, expect, spyOn, test } from 'bun:test';
import { Document, WebIO } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, KHRTextureBasisu } from '@gltf-transform/extensions';
import type { Mesh, MeshStandardMaterial } from 'three';
import sharp from 'sharp';

import * as renderModule from '../../render';
import {
  GLB_GEOMETRY_FLAT_REASON,
  geometryFlatTextureReasonCode,
  loadGlbGeometryFlatScene,
  loadGlbReviewScene,
  measureBounds,
  renderGlbViewGrid,
} from '..';

const io = (): WebIO => new WebIO().registerExtensions([EXTMeshGPUInstancing, KHRTextureBasisu]);

function triangleDocument(
  options: {
    alpha?: number;
    texture?: boolean;
    translation?: [number, number, number];
    scale?: [number, number, number];
  } = {},
): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor('positions')
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor('indices')
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);
  const material = doc
    .createMaterial('FactorMaterial')
    .setBaseColorFactor([0.25, 0.5, 0.75, options.alpha ?? 1])
    .setAlphaMode(options.alpha === undefined ? 'OPAQUE' : 'BLEND')
    .setDoubleSided(true);
  if (options.texture) {
    material.setBaseColorTexture(
      doc
        .createTexture('TinyPng')
        .setMimeType('image/png')
        .setImage(
          new Uint8Array(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==',
              'base64',
            ),
          ),
        ),
    );
  }
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', positions)
    .setIndices(indices)
    .setMaterial(material);
  const node = doc
    .createNode('Triangle')
    .setMesh(doc.createMesh('TriangleMesh').addPrimitive(primitive))
    .setTranslation(options.translation ?? [0, 0, 0])
    .setScale(options.scale ?? [1, 1, 1]);
  const scene = doc.createScene('Scene').addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

describe('GLB-native geometry-flat view input', () => {
  test.each([3, 4] as const)(
    'review retains normalized %i-component vertex colors and material factors',
    async (size) => {
      const doc = triangleDocument({ alpha: 0.4 });
      const values =
        size === 3
          ? [255, 0, 64, 0, 128, 255, 32, 255, 0]
          : [255, 0, 64, 255, 0, 128, 255, 128, 32, 255, 0, 0];
      doc
        .getRoot()
        .listMeshes()[0]!
        .listPrimitives()[0]!
        .setAttribute(
          'COLOR_0',
          doc
            .createAccessor()
            .setType(size === 3 ? 'VEC3' : 'VEC4')
            .setNormalized(true)
            .setArray(Uint8Array.from(values))
            .setBuffer(doc.getRoot().listBuffers()[0]!),
        );
      const loaded = await loadGlbReviewScene(await io().writeBinary(doc));
      const mesh = loaded.root.getObjectByName('Triangle')!.children[0] as Mesh;
      const color = mesh.geometry.getAttribute('color');
      expect(color?.itemSize).toBe(size);
      expect(Array.from(color.array)).toEqual(values.map((v) => Math.fround(v / 255)));
      const material = mesh.material as MeshStandardMaterial;
      expect(material.vertexColors).toBe(true);
      expect(material.color.toArray()).toEqual([0.25, 0.5, 0.75]);
      expect(material.opacity).toBe(0.4);
      expect(material.transparent).toBe(true);
      const derivative = await renderModule.renderSceneToGLB(loaded.root, {
        gltfExporter: 'three',
        derivative: true,
        optimize: 'off',
      });
      const preserved = (await io().readBinary(derivative.bytes))
        .getRoot()
        .listMeshes()[0]!
        .listPrimitives()[0]!
        .getAttribute('COLOR_0')!;
      expect(preserved.getElementSize()).toBe(size);
      expect(Array.from(preserved.getArray()!)).toEqual(Array.from(color.array));
    },
  );

  test('review retains secondary UVs used by a texture channel', async () => {
    const doc = triangleDocument({ texture: true });
    doc
      .getRoot()
      .listTextures()[0]!
      .setImage(
        await sharp({
          create: { width: 1, height: 1, channels: 4, background: '#ff0000' },
        })
          .png()
          .toBuffer(),
      );
    const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    for (let channel = 0; channel < 4; channel++) {
      primitive.setAttribute(
        `TEXCOORD_${channel}`,
        doc
          .createAccessor()
          .setType('VEC2')
          .setArray(new Float32Array([channel, 0, channel + 1, 0, channel, 1]))
          .setBuffer(doc.getRoot().listBuffers()[0]!),
      );
    }
    primitive.getMaterial()!.getBaseColorTextureInfo()!.setTexCoord(2);
    const loaded = await loadGlbReviewScene(await io().writeBinary(doc));
    const mesh = loaded.root.getObjectByName('Triangle')!.children[0] as Mesh;
    expect((mesh.material as MeshStandardMaterial).map!.channel).toBe(2);
    for (let channel = 0; channel < 4; channel++) {
      expect(
        Array.from(mesh.geometry.getAttribute(channel ? `uv${channel}` : 'uv')?.array ?? []),
      ).toEqual([channel, 0, channel + 1, 0, channel, 1]);
    }
    const derivative = await renderModule.renderSceneToGLB(loaded.root, {
      gltfExporter: 'three',
      derivative: true,
      optimize: 'off',
    });
    const result = await io().readBinary(derivative.bytes);
    const output = result.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(output.getMaterial()!.getBaseColorTextureInfo()!.getTexCoord()).toBe(2);
    for (let channel = 0; channel < 4; channel++)
      expect(Array.from(output.getAttribute(`TEXCOORD_${channel}`)!.getArray()!)).toEqual([
        channel,
        0,
        channel + 1,
        0,
        channel,
        1,
      ]);
  });

  test('shared mesh resources retain owning node names in primitive QA repair hints', async () => {
    const doc = triangleDocument();
    const first = doc.getRoot().listNodes()[0]!.setName('ChainLink_A');
    const sharedMesh = first.getMesh()!;
    doc
      .getRoot()
      .getDefaultScene()!
      .addChild(doc.createNode('ChainLink_B').setMesh(sharedMesh).setTranslation([2, 0, 0]));
    const bytes = await io().writeBinary(doc);
    const exported = await io().readBinary(bytes);
    expect(exported.getRoot().listMeshes()).toHaveLength(1);
    expect(
      exported
        .getRoot()
        .listNodes()
        .map((node) => node.getMesh()),
    ).toEqual([exported.getRoot().listMeshes()[0]!, exported.getRoot().listMeshes()[0]!]);
    const loaded = await loadGlbReviewScene(bytes);
    expect(loaded.root.getObjectByName('ChainLink_A')!.children[0]!.name).toBe(
      'ChainLink_A:primitive-0',
    );
    expect(loaded.root.getObjectByName('ChainLink_B')!.children[0]!.name).toBe(
      'ChainLink_B:primitive-0',
    );
    expect(measureBounds(loaded.root)).toEqual({ min: [0, 0, 0], max: [3, 1, 0] });
    const warnings = renderModule.inspectSceneStructure(loaded.root).join('\n');
    expect(warnings).toContain(
      'shift "ChainLink_A:primitive-0" by [1.000, 0.000, 0.000] toward "ChainLink_B:primitive-0"',
    );
    expect(warnings).toContain(
      'shift "ChainLink_B:primitive-0" by [-1.000, 0.000, 0.000] toward "ChainLink_A:primitive-0"',
    );
    expect(warnings).not.toContain('TriangleMesh');
  });

  test('unnamed review nodes retain mesh-resource names as a fallback', async () => {
    const doc = triangleDocument();
    doc.getRoot().listNodes()[0]!.setName('');
    const loaded = await loadGlbReviewScene(await io().writeBinary(doc));
    expect(loaded.root.children[0]!.children[0]!.name).toBe('TriangleMesh:primitive-0');
  });

  test('reads exact bytes without executeKilnCode and reports their SHA-256 identity', async () => {
    const bytes = await io().writeBinary(triangleDocument());
    const executeSpy = spyOn(renderModule, 'executeKilnCode');
    try {
      const result = await renderGlbViewGrid(bytes, { size: 32 });
      expect(result.png.byteLength).toBeGreaterThan(100);
      expect(executeSpy).not.toHaveBeenCalled();
      expect(result.inputGlbSha256).toBe(
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      );
    } finally {
      executeSpy.mockRestore();
    }
  });

  test('preserves node world transforms and base color/alpha factors', async () => {
    const bytes = await io().writeBinary(
      triangleDocument({ alpha: 0.4, translation: [2, 3, 4], scale: [2, 3, 1] }),
    );
    const loaded = await loadGlbGeometryFlatScene(bytes);
    expect(measureBounds(loaded.root)).toEqual({ min: [2, 3, 4], max: [4, 6, 4] });

    const meshes: Array<{
      material?: { color?: unknown; opacity?: number; doubleSided?: boolean };
    }> = [];
    loaded.root.traverse?.((value: unknown) => meshes.push(value as (typeof meshes)[number]));
    expect(meshes[0]?.material).toMatchObject({
      color: { r: 0.25, g: 0.5, b: 0.75 },
      opacity: 0.4,
      doubleSided: true,
    });
  });

  test('expands EXT_mesh_gpu_instancing transforms into exact flat geometry', async () => {
    const doc = triangleDocument();
    const node = doc.getRoot().listNodes()[0]!;
    const translations = doc
      .createAccessor('instance translations')
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 10, 0, 0]))
      .setBuffer(doc.getRoot().listBuffers()[0]!);
    const extension = doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
    node.setExtension(
      'EXT_mesh_gpu_instancing',
      extension.createInstancedMesh().setAttribute('TRANSLATION', translations),
    );

    const loaded = await loadGlbGeometryFlatScene(await io().writeBinary(doc));
    expect(loaded.instanceCount).toBe(2);
    expect(measureBounds(loaded.root)).toEqual({ min: [0, 0, 0], max: [11, 1, 0] });
    const review = await loadGlbReviewScene(await io().writeBinary(doc));
    expect(review.root.getObjectByName('Triangle')!.children.map((node) => node.name)).toEqual([
      'Triangle:primitive-0:instance-0',
      'Triangle:primitive-0:instance-1',
    ]);
  });

  test('reports stable structured reasons for ignored PNG and KTX2 sampling', async () => {
    const png = await loadGlbGeometryFlatScene(
      await io().writeBinary(triangleDocument({ texture: true })),
    );
    expect(png.reasonCodes).toEqual([GLB_GEOMETRY_FLAT_REASON.TEXTURE_SAMPLING_UNSUPPORTED]);
    expect(geometryFlatTextureReasonCode('image/ktx2')).toBe(
      GLB_GEOMETRY_FLAT_REASON.KTX2_SAMPLING_UNSUPPORTED,
    );
  });

  test('review scene retains embedded texture bytes for derivative re-export', async () => {
    const source = triangleDocument({ texture: true });
    const expected = source.getRoot().listTextures()[0]!.getImage()!;
    const loaded = await loadGlbReviewScene(await io().writeBinary(source));
    let encoded: Uint8Array | undefined;
    loaded.root.traverse((node) => {
      const map = (node as { material?: { map?: { userData?: Record<string, unknown> } } }).material
        ?.map;
      const record = map?.userData?.encoded as { bytes?: Uint8Array } | undefined;
      if (record?.bytes) encoded = record.bytes;
    });
    expect(encoded).toEqual(expected);
  });

  // The delivery contract tells consumers to read a GLB headlessly through this
  // reader because three's GLTFLoader reads `self.URL` for every image: `parseAsync`
  // on a textured GLB throws `ReferenceError: self is not defined` under Node and
  // binds a null map under Bun, which defines `self` (#292). Deleting the global is
  // what makes this a guard rather than a restatement -- GLTFLoader throws here.
  test('review scene binds an embedded texture with no DOM global defined', async () => {
    const source = triangleDocument({ texture: true });
    const expected = source.getRoot().listTextures()[0]!.getImage()!;
    const bytes = await io().writeBinary(source);
    const scope = globalThis as { self?: unknown };
    const had = 'self' in scope;
    const previous = scope.self;
    delete scope.self;
    try {
      const loaded = await loadGlbReviewScene(bytes);
      const bound: Uint8Array[] = [];
      loaded.root.traverse((node) => {
        const map = (node as { material?: { map?: { userData?: Record<string, unknown> } } })
          .material?.map;
        const record = map?.userData?.encoded as { bytes?: Uint8Array } | undefined;
        if (record?.bytes) bound.push(record.bytes);
      });
      expect(bound).toEqual([expected]);
    } finally {
      if (had) scope.self = previous;
    }
  });

  test('review scene retains normal and uv attributes from primitive', async () => {
    const doc = triangleDocument();
    const buffer = doc.getRoot().listBuffers()[0]!;
    const normals = doc
      .createAccessor('normals')
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer);
    const uvs = doc
      .createAccessor('uvs')
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0.5, 1]))
      .setBuffer(buffer);
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    prim.setAttribute('NORMAL', normals).setAttribute('TEXCOORD_0', uvs);

    const loaded = await loadGlbReviewScene(await io().writeBinary(doc));
    let foundNormal = false;
    let foundUv = false;
    loaded.root.traverse((node) => {
      const mesh = node as { isMesh?: boolean; geometry?: { getAttribute(name: string): unknown } };
      if (mesh.isMesh && mesh.geometry) {
        if (mesh.geometry.getAttribute('normal')) foundNormal = true;
        if (mesh.geometry.getAttribute('uv')) foundUv = true;
      }
    });
    expect(foundNormal).toBe(true);
    expect(foundUv).toBe(true);
  });
});
