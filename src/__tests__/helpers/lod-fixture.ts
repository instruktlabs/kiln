/**
 * Level-of-detail fixtures for the LOD contract's tests.
 *
 * A three-tier vehicle program in the pattern the owner's convention describes: three body
 * tiers built by one routine and declared with defineLod, and four wheels outside the body set
 * that vanish at distance through their own two-level sets with an empty far level. LOD2 is a
 * tall block, so bounds or views that counted it would reach 3 m where LOD0 reaches 1.5 m.
 *
 * And a GLB whose chains another tool wrote, for import paths (`importedLodGlb`).
 */
import { Document, Format, type Buffer as GltfBuffer, type Material } from '@gltf-transform/core';
import { createGltfIO } from '../../gltf-io';

export const BODY_COVERAGE = [0.004, 0.0002, 0.000006];
export const WHEEL_COVERAGE = [0.00005, 0];
export const WHEELS = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] as const;

export const TIERED_CAR = `const meta = { name: 'Tiered Car' };
function build() {
  const root = createRoot('Car');
  const paint = gameMaterial(0x3366aa);
  const rubber = gameMaterial(0x151515);
  const tiers = [0, 1, 2].map((lod) => {
    const group = new THREE.Group();
    group.name = 'Body_LOD' + lod;
    root.add(group);
    createPart('Shell' + lod, boxGeo(4 - lod * 0.5, lod === 2 ? 3 : 1.2, 1.8), paint, {
      parent: group, position: [0, lod === 2 ? 1.5 : 0.9, 0] });
    if (lod === 0) createPart('Mirror', boxGeo(0.1, 0.1, 0.3), paint, { parent: group, position: [1, 1.4, 1.05] });
    return group;
  });
  defineLod(tiers, { screenCoverage: [${BODY_COVERAGE.join(', ')}] });
  for (const [name, x, z] of [['Wheel_FL', 1.3, 1.05], ['Wheel_FR', 1.3, -1.05], ['Wheel_RL', -1.3, 1.05], ['Wheel_RR', -1.3, -1.05]]) {
    const near = new THREE.Group();
    near.name = name + '_LOD0';
    near.position.set(x, 0.35, z);
    root.add(near);
    createPart('Tyre_' + name, boxGeo(0.7, 0.7, 0.3), rubber, { parent: near });
    const far = new THREE.Group();
    far.name = name + '_LOD1';
    far.position.set(x, 0.35, z);
    root.add(far);
    defineLod([near, far], { screenCoverage: [${WHEEL_COVERAGE.join(', ')}] });
  }
  return root;
}`;

/** Placed triangles per level: LOD0 body shell and mirror, one box per lower tier and wheel. */
export const TIERED_CAR_TRIANGLES = { body: [24, 12, 12], wheel: [12, 0], headline: 72 };

const at = (name: string) => `/Tiered%20Car[0]/Car[0]/${name}[0]`;

/** The chains the tiered car's bytes carry, in scene order, as Kiln summarizes them. */
export const TIERED_CAR_CHAINS = [
  {
    path: at('Body_LOD0'),
    screenCoverage: BODY_COVERAGE,
    levels: [0, 1, 2].map((level) => ({
      level,
      name: `Body_LOD${level}`,
      path: at(`Body_LOD${level}`),
      triangles: TIERED_CAR_TRIANGLES.body[level]!,
    })),
  },
  ...WHEELS.map((wheel) => ({
    path: at(`${wheel}_LOD0`),
    screenCoverage: WHEEL_COVERAGE,
    levels: [0, 1].map((level) => ({
      level,
      name: `${wheel}_LOD${level}`,
      path: at(`${wheel}_LOD${level}`),
      triangles: TIERED_CAR_TRIANGLES.wheel[level]!,
    })),
  })),
];

/** Screen coverage on each imported bus's LOD0. */
export const IMPORTED_COVERAGE = [0.5, 0.2, 0.01];

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
export async function importedLodGlb(copies = 1): Promise<Uint8Array> {
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
    lod0.extras = { MSFT_screencoverage: IMPORTED_COVERAGE };
  }
  json.materials![materialIndex('Paint')]!.extensions = {
    MSFT_lod: { ids: [materialIndex('Paint_low')] },
  };
  json.extensionsUsed = [...(json.extensionsUsed ?? []), 'MSFT_lod'];
  for (const entry of json.buffers ?? []) delete entry.uri;
  return packGlb(json, Object.values(resources)[0]!);
}
