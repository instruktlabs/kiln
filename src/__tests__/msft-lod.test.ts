/**
 * MSFT_lod through Kiln's GLB rewrite seams (R37).
 *
 * An imported GLB can carry a level-of-detail chain: the highest-detail node sits in the
 * scene and lists lower levels by node index in `extensions.MSFT_lod.ids`; the lower levels
 * live outside every scene, and a material may list lower-cost materials the same way. The
 * fixture here is written the way another tool writes it (patched glTF JSON packed by hand),
 * so it does not depend on Kiln's own extension support. Every seam that re-saves bytes must
 * keep each chain with valid ids, and a pass that would move or fold a LOD node stands down.
 */
import { describe, expect, test } from 'bun:test';
import { Document, Format, type Buffer as GltfBuffer, type Material } from '@gltf-transform/core';
import { createGltfIO } from '../gltf-io';
import { composeSceneGLB, optimizeGlbBytes, packKitGlb, snapGlbToPalette } from '../render';

interface NodeJson {
  name?: string;
  mesh?: number;
  children?: number[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

interface GlbJson {
  extensionsUsed?: string[];
  scenes?: { nodes?: number[] }[];
  nodes?: NodeJson[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { name?: string; extensions?: Record<string, unknown> }[];
}

const SCREEN_COVERAGE = [0.5, 0.2, 0.01];

function glbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GlbJson;
}

function packGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const pad = (bytes: Uint8Array, fill: number) => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
    out.set(bytes);
    return out;
  };
  const jsonChunk = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const glb = new Uint8Array(28 + jsonChunk.length + binChunk.length);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.length, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonChunk, 20);
  view.setUint32(20 + jsonChunk.length, binChunk.length, true);
  view.setUint32(24 + jsonChunk.length, 0x004e4942, true);
  glb.set(binChunk, 28 + jsonChunk.length);
  return glb;
}

function box(doc: Document, buffer: GltfBuffer, name: string, size: number, material: Material) {
  const s = size / 2;
  const corners = [
    [-s, -s, -s],
    [s, -s, -s],
    [s, s, -s],
    [-s, s, -s],
    [-s, -s, s],
    [s, -s, s],
    [s, s, s],
    [-s, s, s],
  ];
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ];
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(corners.flat()))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array(faces))
    .setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setIndices(indices)
    .setMaterial(material);
  return doc.createMesh(name).addPrimitive(primitive);
}

/**
 * `copies` buses, each a `Bus_n` group holding its `Bus_n_LOD0` body, whose MSFT_lod ids
 * name `Bus_n_LOD1` and `Bus_n_LOD2` outside the scene. The bodies share one mesh, so five
 * copies cross the GPU-instancing threshold. Material `Paint` lists `Paint_low`, which no
 * primitive uses. Four distinct flat colours on primitives let palette() act.
 */
async function lodGlb(copies = 1): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const paint = doc.createMaterial('Paint').setBaseColorFactor([0.8, 0.2, 0.1, 1]);
  doc.createMaterial('Paint_low').setBaseColorFactor([0.7, 0.25, 0.1, 1]);
  const trim = doc.createMaterial('Trim').setBaseColorFactor([0.1, 0.3, 0.7, 1]);
  const tyre = doc.createMaterial('Tyre').setBaseColorFactor([0.05, 0.05, 0.05, 1]);
  const sign = doc.createMaterial('Sign').setBaseColorFactor([0.9, 0.9, 0.2, 1]);
  const body = box(doc, buffer, 'Body', 2, paint);
  const bodyMid = box(doc, buffer, 'Body_mid', 1.9, trim);
  const bodyFar = box(doc, buffer, 'Body_far', 1.8, tyre);
  const signMesh = box(doc, buffer, 'Sign', 0.4, sign);
  const scene = doc.createScene('Scene');
  const names: string[] = [];
  for (let i = 0; i < copies; i++) {
    const name = copies === 1 ? 'Bus' : `Bus_${i}`;
    names.push(name);
    doc.createNode(`${name}_LOD1`).setMesh(bodyMid);
    doc.createNode(`${name}_LOD2`).setMesh(bodyFar);
    const group = doc
      .createNode(name)
      .setTranslation([5 + 3 * i, 0, 0])
      .addChild(doc.createNode(`${name}_LOD0`).setMesh(body))
      .addChild(doc.createNode(`${name}_Sign`).setMesh(signMesh).setTranslation([0, 1.5, 0]));
    scene.addChild(group);
  }
  const { json, resources } = await createGltfIO().writeJSON(doc, { format: Format.GLB });
  const nodeIndex = (name: string) => (json.nodes ?? []).findIndex((node) => node.name === name);
  const materialIndex = (name: string) =>
    (json.materials ?? []).findIndex((material) => material.name === name);
  for (const name of names) {
    const lod0 = json.nodes![nodeIndex(`${name}_LOD0`)]!;
    lod0.extensions = {
      MSFT_lod: { ids: [nodeIndex(`${name}_LOD1`), nodeIndex(`${name}_LOD2`)] },
    };
    lod0.extras = { MSFT_screencoverage: SCREEN_COVERAGE };
  }
  json.materials![materialIndex('Paint')]!.extensions = {
    MSFT_lod: { ids: [materialIndex('Paint_low')] },
  };
  json.extensionsUsed = [...(json.extensionsUsed ?? []), 'MSFT_lod'];
  for (const entry of json.buffers ?? []) delete entry.uri;
  return packGlb(json, Object.values(resources)[0]!);
}

function sceneNodeIndices(json: GlbJson): Set<number> {
  const reached = new Set<number>();
  const visit = (index: number) => {
    if (reached.has(index)) return;
    reached.add(index);
    for (const child of json.nodes?.[index]?.children ?? []) visit(child);
  };
  for (const scene of json.scenes ?? []) for (const index of scene.nodes ?? []) visit(index);
  return reached;
}

function lodIds(extensions: Record<string, unknown> | undefined): number[] | undefined {
  return (extensions?.['MSFT_lod'] as { ids?: number[] } | undefined)?.ids;
}

function parentName(json: GlbJson, index: number): string | undefined {
  return json.nodes?.find((node) => node.children?.includes(index))?.name;
}

/**
 * Asserts one intact chain per bus: LOD0 in the scene under its own group, lower levels
 * resolving to distinct off-scene nodes with the expected names, the coverage extras kept,
 * and the body material listing one lower-cost material. Returns the material chain names.
 */
function expectLodChains(bytes: Uint8Array, buses: string[]): string[][] {
  const json = glbJson(bytes);
  expect(json.extensionsUsed ?? []).toContain('MSFT_lod');
  const inScene = sceneNodeIndices(json);
  const nodes = json.nodes ?? [];
  const chains = nodes
    .map((node, index) => ({ node, index, ids: lodIds(node.extensions) }))
    .filter((entry) => entry.ids !== undefined);
  expect(chains.map((entry) => entry.node.name).sort()).toEqual(
    buses.map((bus) => `${bus}_LOD0`).sort(),
  );
  const levels = new Set<number>();
  const materialChains: string[][] = [];
  for (const { node, index, ids } of chains) {
    const bus = node.name!.replace(/_LOD0$/, '');
    expect(inScene.has(index)).toBe(true);
    expect(parentName(json, index)).toBe(bus);
    expect(ids!.map((id) => nodes[id]?.name)).toEqual([`${bus}_LOD1`, `${bus}_LOD2`]);
    for (const id of ids!) {
      expect(inScene.has(id)).toBe(false);
      expect(nodes[id]?.mesh).toBeDefined();
      levels.add(id);
    }
    expect(node.extras?.['MSFT_screencoverage']).toEqual(SCREEN_COVERAGE);
    const materialIndex = json.meshes?.[node.mesh!]?.primitives[0]?.material;
    const materialIds = lodIds(json.materials?.[materialIndex!]?.extensions);
    expect(materialIds).toHaveLength(1);
    expect(materialIds![0]).not.toBe(materialIndex);
    const lower = json.materials?.[materialIds![0]!];
    expect(lower).toBeDefined();
    materialChains.push([String(json.materials?.[materialIndex!]?.name), String(lower?.name)]);
  }
  expect(levels.size).toBe(buses.length * 2);
  return materialChains;
}

describe('MSFT_lod survives Kiln GLB rewrites', () => {
  test('a Kiln read and write keeps node and material LOD chains', async () => {
    const io = createGltfIO();
    const bytes = await io.writeBinary(await io.readBinary(await lodGlb()));

    expect(expectLodChains(bytes, ['Bus'])).toEqual([['Paint', 'Paint_low']]);
  });

  test('palette consolidation keeps levels that only MSFT_lod references', async () => {
    const result = await optimizeGlbBytes(await lodGlb(), { mode: 'palette' });

    expect(result?.summary?.mode).toBe('palette');
    // palette() rebinds the body to a clone; the chain moves with it and stays distinct.
    const [[body, lower]] = expectLodChains(result!.bytes, ['Bus']) as [[string, string]];
    expect(body).toMatch(/^PaletteMaterial/);
    expect(lower).toBe('Paint_low');
  });

  test('full consolidation degrades to palette instead of flattening a LOD chain', async () => {
    const result = await optimizeGlbBytes(await lodGlb(), { mode: 'full' });

    expect(result?.summary?.mode).toBe('palette');
    expectLodChains(result!.bytes, ['Bus']);
  });

  test('GPU instancing stands down rather than fold LOD nodes into a batch', async () => {
    const bytes = await lodGlb(5);

    expect(await optimizeGlbBytes(bytes, { mode: 'off', instance: 'on' })).toBeUndefined();
    const combined = await optimizeGlbBytes(bytes, { mode: 'palette', instance: 'on' });
    expect(combined?.instancing).toBeUndefined();
    expect(glbJson(combined!.bytes).extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing');
    expectLodChains(
      combined!.bytes,
      [0, 1, 2, 3, 4].map((i) => `Bus_${i}`),
    );
  });

  test('palette snap and kit packing keep the chain', async () => {
    const bytes = await lodGlb();
    const snapped = await snapGlbToPalette(bytes, [{ color: '#cc3311' }, { color: '#2255aa' }]);
    const packed = await packKitGlb(bytes, {
      variants: [{ name: 'Night', slots: [{ color: '#112233' }] }],
      ktx2: false,
    });

    expect(snapped?.snapped).toBeGreaterThan(0);
    expectLodChains(snapped!.bytes, ['Bus']);
    expect(packed?.summary.variantsAdded).toEqual(['Night']);
    expectLodChains(packed!.bytes, ['Bus']);
  });

  test('scene composition keeps each placement on its own chain', async () => {
    const bytes = await lodGlb();
    const place = (x: number) => ({
      bytes,
      transform: {
        pos: [x, 0, 0] as [number, number, number],
        rotDeg: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
    });

    for (const optimize of ['palette', 'full'] as const) {
      const scene = await composeSceneGLB([place(0), place(20)], { optimize });
      expectLodChains(scene.bytes, ['Bus', 'Bus']);
    }
  });
});
