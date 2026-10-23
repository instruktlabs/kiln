/**
 * three.js runtime delivery target (delivery contract item 6).
 *
 * `exportAssetGlb(record, { profile: 'runtime', target: 'three' })` and
 * `deliverThreeRuntimeGlb(bytes)` derive a meshopt-compressed, quantized GLB with scoped GPU
 * instancing, and keep custom attributes, roles, hidden colliders, anchors, kit extras and
 * MSFT_lod chains. The qualification loads the result through three's GLTFLoader with the
 * meshopt decoder.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { deliverThreeRuntimeGlb, exportAssetGlb } from '../asset-export';
import type { AssetRecord } from '../assets';
import { KILN_REPEAT_INSTANCES_KEY, repeatInstances } from '../delivery';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess, renderSceneToGLB } from '../render';
import { validateAtlasDocumentProvenance } from '../atlas-provenance';
import { createGltfIO } from '../gltf-io';
import { encodePng } from '../views/png';

const BUNKER = readFileSync(resolve('src/__tests__/fixtures/bunker-door-frame.kiln.js'), 'utf8');

/** Bytes of the GLB's binary chunk: the geometry the compression acts on. */
const binaryChunkBytes = (glb: Uint8Array) =>
  glb.byteLength - 20 - new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const RUNTIME_PROGRAM = `const meta={name:'Runtime Probe'};
function build(){
  const root=createRoot('Root');
  const steel=gameMaterial('#777777');
  const frame=createPart('Frame',boxGeo(2,3,0.4),steel,{parent:root,position:[0,1.5,0]});
  defineModule(root,{footprint:[2,0.4],height:3,snapAxis:'x',origin:'center'});
  port('west',{parent:root,position:[-1,0,0]});
  colliderBox([2,3,0.4],{id:'frame',parent:root,position:[0,1.5,0]});
  anchor('light','top',{parent:root,position:[0,2.9,0]});
  const bolts=new THREE.Group(); bolts.name='Bolts'; root.add(bolts);
  const boltGeo=cylinderGeo(0.03,0.03,0.05,8);
  for(let i=0;i<4;i++) createPart('Bolt_'+i,boltGeo,steel,{parent:bolts,position:[-0.9+i*0.6,2.9,0.22]});
  repeatInstances(bolts);
  const tiers=['Lamp_LOD0','Lamp_LOD1'].map((name)=>{const g=new THREE.Group();g.name=name;root.add(g);return g;});
  createPart('Lamp',boxGeo(0.2,0.2,0.2),steel,{parent:tiers[0],position:[0,3.1,0]});
  createPart('Card',planeGeo(0.2,0.2),steel,{parent:tiers[1],position:[0,3.1,0]});
  defineLod(tiers,{screenCoverage:[0.2,0],impostor:true});
  bakeSurfaceAttributes(frame,{cavity:{rays:8}});
  return root;
}`;

function assetRecord(bytes: Uint8Array): AssetRecord {
  return {
    manifest: {
      version: 'kiln.asset.v1',
      assetId: 'a_runtime',
      revisionId: 'r_runtime',
      name: 'Runtime Probe',
      tags: [],
      createdAt: '2026-10-15T00:00:00.000Z',
      editable: false,
      files: { 'asset.glb': { bytes: bytes.length, sha256: sha(bytes) as `sha256:${string}` } },
    },
    files: { 'asset.glb': bytes },
  };
}

/** Load a GLB the way a three.js application does: GLTFLoader plus the meshopt decoder. */
async function loadWithGltfLoader(bytes: Uint8Array) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(Uint8Array.from(bytes).buffer, '');
}

const find = (root: THREE.Object3D, name: string) => {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};

describe('repeatInstances', () => {
  test('marks a parent and is a sandbox helper', () => {
    const group = new THREE.Group();
    expect(repeatInstances(group)).toBe(group);
    expect(group.userData[KILN_REPEAT_INSTANCES_KEY]).toEqual({ schemaVersion: 1 });
    expect(typeof buildSandboxGlobals().repeatInstances).toBe('function');
    expect(() => repeatInstances({} as THREE.Object3D)).toThrow(/repeatInstances/);
  });
});

describe('three runtime target', () => {
  for (const gltfExporter of ['legacy', 'three'] as const)
    test(`${gltfExporter} converter output qualifies through GLTFLoader`, async () => {
      const rendered = await renderGLBInProcess(RUNTIME_PROGRAM, { gltfExporter });
      const source = new Uint8Array(rendered.glb);
      const output = await exportAssetGlb(assetRecord(source), {
        profile: 'runtime',
        target: 'three',
        metadataFileName: 'probe.kiln-metadata.json',
      });
      if (output.profile !== 'runtime') throw new Error('expected runtime');
      const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
      expect(metadata.target).toBe('three');
      const delivery = metadata.delivery;
      expect(delivery.extensionsRequired).toEqual(
        expect.arrayContaining([
          'EXT_meshopt_compression',
          'KHR_mesh_quantization',
          'EXT_mesh_gpu_instancing',
        ]),
      );
      expect(delivery.extensionsUsed).toEqual(
        expect.arrayContaining(['KHR_node_visibility', 'MSFT_lod']),
      );
      expect(delivery.quantization).toMatchObject({
        extension: 'KHR_mesh_quantization',
        bits: { position: 14, normal: 10, texcoord: 12 },
        customAttributes: 'float32',
      });
      expect(delivery.customAttributes.map((a: { name: string }) => a.name)).toEqual([
        '_EDGE',
        '_CAVITY',
      ]);
      expect(delivery.instancing).toEqual([
        expect.objectContaining({
          count: 4,
          instances: ['Mesh_Bolt_0', 'Mesh_Bolt_1', 'Mesh_Bolt_2', 'Mesh_Bolt_3'],
        }),
      ]);
      expect(delivery.ktx2).toMatchObject({ status: 'skipped' });
      expect(delivery.colliderProxies).toHaveLength(1);
      expect(delivery.preserved).toMatchObject({
        lodChains: 1,
        colliders: 1,
        anchors: 1,
        ports: 1,
        kitModules: 1,
      });
      // The frame mesh carries its dequantization on its node: the sidecar says so.
      const frameScale = delivery.nodeScale.find((entry: { node: string }) =>
        entry.node.includes('Frame'),
      );
      expect(frameScale.dequantization.scale).toBeGreaterThan(1);
      // Geometry shrinks; on a probe this small the extension JSON can outweigh it.
      expect(binaryChunkBytes(output.glb)).toBeLessThan(binaryChunkBytes(source));

      const gltf = await loadWithGltfLoader(output.glb);
      const scene = gltf.scene;
      // Roles and kit extras arrive as userData.
      expect(scene.getObjectByName('Root')!.userData.kilnSemantic.roles).toContain('kit.module');
      expect(scene.getObjectByName('Root')!.userData.kilnKit).toMatchObject({ height: 3 });
      expect(find(scene, 'Port_west').userData.kilnSemantic.roles).toContain('kit.port.west');
      expect(find(scene, 'Anchor_light_top').userData.kilnSemantic.roles).toContain(
        'anchor.light.top',
      );
      // The collider keeps its hidden flag and its authored size; the proxy is its child.
      const collider = find(scene, 'Collider_box_frame');
      expect(collider.userData.gltfExtensions.KHR_node_visibility).toEqual({ visible: false });
      [2, 3, 0.4].forEach((size, axis) => {
        expect(collider.scale.getComponent(axis)).toBeCloseTo(size, 6);
      });
      expect((find(scene, 'Collider_box_frame_Proxy') as THREE.Mesh).isMesh).toBe(true);
      // Custom attributes survive as float attributes (three lowercases custom names).
      let edge: THREE.BufferAttribute | undefined;
      find(scene, 'Mesh_Frame').traverse((object) => {
        const geometry = (object as THREE.Mesh).geometry;
        if (geometry?.getAttribute('_edge')) edge = geometry.getAttribute('_edge') as never;
      });
      expect(edge).toBeDefined();
      expect(edge!.array).toBeInstanceOf(Float32Array);
      expect(edge!.normalized).toBe(false);
      // The four bolts load as one InstancedMesh.
      const instanced: THREE.InstancedMesh[] = [];
      scene.traverse((object) => {
        if ((object as THREE.InstancedMesh).isInstancedMesh) instanced.push(object as never);
      });
      expect(instanced).toHaveLength(1);
      expect(instanced[0]!.count).toBe(4);
      // MSFT_lod survives as node extension data and its lower level node loads.
      const lamp = find(scene, 'Lamp_LOD0');
      const ids = lamp.userData.gltfExtensions.MSFT_lod.ids as number[];
      expect(ids).toHaveLength(1);
      const level = (await gltf.parser.getDependency('node', ids[0]!)) as THREE.Object3D;
      expect(level.name).toBe('Lamp_LOD1');
      expect(scene.getObjectByName('Lamp_LOD1')).toBeUndefined();
      expect(lamp).not.toBeInstanceOf(THREE.LOD);
      // GLTFLoader does not choose a level. An application must attach and select it.
      lamp.parent!.add(level);
      lamp.visible = false;
      level.visible = true;
      scene.updateMatrixWorld(true);
      const cardBounds = new THREE.Box3().setFromObject(level, true);
      expect(cardBounds.getSize(new THREE.Vector3()).x).toBeCloseTo(0.2, 3);
      expect(cardBounds.getCenter(new THREE.Vector3()).y).toBeCloseTo(3.1, 3);
    });

  test('compression none loads without a Meshopt decoder and keeps every other feature', async () => {
    const rendered = await renderGLBInProcess(RUNTIME_PROGRAM);
    const source = new Uint8Array(rendered.glb);
    const derive = (compression?: 'meshopt' | 'none') =>
      exportAssetGlb(assetRecord(source), {
        profile: 'runtime',
        target: 'three',
        ...(compression ? { compression } : {}),
      });
    const [plain, meshopt, defaulted] = await Promise.all([
      derive('none'),
      derive('meshopt'),
      derive(),
    ]);
    if (
      plain.profile !== 'runtime' ||
      meshopt.profile !== 'runtime' ||
      defaulted.profile !== 'runtime'
    )
      throw new Error('expected runtime');
    // The default is the Meshopt output, byte for byte.
    expect(defaulted.glb).toEqual(meshopt.glb);
    expect(defaulted.metadata.bytes).toEqual(meshopt.metadata.bytes);
    const delivery = JSON.parse(new TextDecoder().decode(plain.metadata.bytes)).delivery;
    expect(delivery.compression).toEqual({ extension: 'none' });
    expect(delivery.extensionsUsed).not.toContain('EXT_meshopt_compression');
    expect(delivery.extensionsRequired).not.toContain('EXT_meshopt_compression');
    expect(delivery.extensionsRequired).toEqual(
      expect.arrayContaining(['KHR_mesh_quantization', 'EXT_mesh_gpu_instancing']),
    );
    expect(delivery.customAttributes.map((a: { name: string }) => a.name)).toEqual([
      '_EDGE',
      '_CAVITY',
    ]);
    const meshoptDelivery = JSON.parse(new TextDecoder().decode(meshopt.metadata.bytes)).delivery;
    expect({
      ...delivery,
      compression: undefined,
      extensionsUsed: undefined,
      extensionsRequired: undefined,
    }).toEqual({
      ...meshoptDelivery,
      compression: undefined,
      extensionsUsed: undefined,
      extensionsRequired: undefined,
    });
    // A loader with no Meshopt decoder reads it, instancing included.
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(plain.glb).buffer, '');
    const instanced: THREE.InstancedMesh[] = [];
    gltf.scene.traverse((object) => {
      if ((object as THREE.InstancedMesh).isInstancedMesh) instanced.push(object as never);
    });
    expect(instanced.map((mesh) => mesh.count)).toEqual([4]);
    await expect(
      new GLTFLoader().parseAsync(Uint8Array.from(meshopt.glb).buffer, ''),
    ).rejects.toThrow(/meshopt/i);
    await expect(
      exportAssetGlb(assetRecord(source), { profile: 'runtime', compression: 'none' }),
    ).rejects.toThrow('compression requires the three runtime target');
    await expect(deliverThreeRuntimeGlb(source, { compression: 'zstd' as never })).rejects.toThrow(
      'compression must be meshopt or none',
    );
  });
  test('KTX2 runs only through an injected encoder and the GLB library helper is equivalent', async () => {
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
      2,
      2,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const root = new THREE.Group();
    root.name = 'Root';
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.1),
      new THREE.MeshStandardMaterial({ map: texture }),
    );
    panel.name = 'Panel';
    root.add(panel);
    const bytes = (await renderSceneToGLB(root)).bytes;
    const skipped = await deliverThreeRuntimeGlb(bytes);
    expect(skipped.delivery.ktx2).toEqual({
      status: 'skipped',
      textures: 1,
      reason: 'No KTX2 encoder was supplied; textures stay PNG or JPEG.',
    });
    const calls: string[] = [];
    const encoded = await deliverThreeRuntimeGlb(bytes, {
      ktx2Encoder: async ({ colorSpace, mimeType }) => {
        calls.push(`${mimeType}:${colorSpace}`);
        return new Uint8Array([
          0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
      },
    });
    expect(calls).toEqual(['image/png:srgb']);
    expect(encoded.delivery.ktx2).toEqual({ status: 'encoded', textures: 1 });
    expect(encoded.delivery.extensionsRequired).toContain('KHR_texture_basisu');
    // Deterministic: the same input gives the same bytes.
    expect((await deliverThreeRuntimeGlb(bytes)).glb).toEqual(skipped.glb);
  });

  test('an authored two-region mask survives save, editable export and the three runtime target', async () => {
    const program = `const meta={name:'Wet Line'};
function build(){
  const root=createRoot('Root');
  const geo=boxGeo(1,1,1);
  const position=geo.getAttribute('position');
  const wet=new Float32Array(position.count);
  for(let i=0;i<position.count;i++) wet[i]=position.getY(i)<0?1:0;
  geo.setAttribute('_wet',new THREE.BufferAttribute(wet,1));
  geo.setAttribute('_aged',new THREE.BufferAttribute(new Float32Array(position.count).fill(0.5),1));
  const rock=createPart('Rock',geo,gameMaterial('#888070'),{parent:root});
  bakeSurfaceAttributes(rock,{cavity:{rays:8}});
  return root;
}`;
    const rendered = await renderGLBInProcess(program);
    expect(rendered.warnings.join('\n')).not.toContain('EXPORT_ATTRIBUTE_UNSUPPORTED');
    const saved = new Uint8Array(rendered.glb);
    const editable = await exportAssetGlb(assetRecord(saved), { profile: 'editable' });
    const runtime = await exportAssetGlb(assetRecord(saved), {
      profile: 'runtime',
      target: 'three',
      metadataFileName: 'rock.kiln-metadata.json',
    });
    if (runtime.profile !== 'runtime') throw new Error('expected runtime');
    const delivery = JSON.parse(new TextDecoder().decode(runtime.metadata.bytes)).delivery;
    expect(delivery.customAttributes.map((a: { name: string }) => a.name)).toEqual([
      '_EDGE',
      '_CAVITY',
      '_AGED',
      '_WET',
    ]);
    expect(delivery.customAttributes[3]).toEqual({
      name: '_WET',
      meshes: 1,
      componentType: 'FLOAT',
      normalized: false,
    });
    for (const bytes of [saved, editable.glb, runtime.glb]) {
      const gltf = await loadWithGltfLoader(bytes);
      let mesh: THREE.Mesh | undefined;
      gltf.scene.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) mesh ??= node as THREE.Mesh;
      });
      if (!mesh) throw new Error('missing mesh');
      const wet = mesh.geometry.getAttribute('_wet');
      const position = mesh.geometry.getAttribute('position');
      const regions = new Set<string>();
      for (let i = 0; i < wet.count; i++) regions.add(`${position.getY(i) < 0}:${wet.getX(i)}`);
      expect([...regions].sort()).toEqual(['false:0', 'true:1']);
    }
  });

  test('target three requires the runtime profile', async () => {
    const rendered = await renderGLBInProcess(RUNTIME_PROGRAM);
    await expect(
      exportAssetGlb(assetRecord(new Uint8Array(rendered.glb)), { target: 'three' }),
    ).rejects.toThrow(/runtime/);
  });

  test('quantized skin retains rest and posed world-space vertices through GLTFLoader', async () => {
    const root = new THREE.Group();
    root.position.set(3, 2, -4);
    const geometry = new THREE.BoxGeometry(2, 4, 1);
    const positions = geometry.getAttribute('position');
    const indices: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const upper = positions.getY(i) > 0;
      indices.push(upper ? 1 : 0, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'Skin';
    const base = new THREE.Bone();
    base.name = 'Base';
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    tip.position.y = 1;
    base.add(tip);
    mesh.add(base);
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([base, tip]));
    const source = await renderSceneToGLB(root, {
      gltfExporter: 'three',
      optimize: 'off',
      derivative: true,
    });
    const runtime = await deliverThreeRuntimeGlb(source.bytes);
    const loaded = await loadWithGltfLoader(runtime.glb);
    const skin = find(loaded.scene, 'Skin') as THREE.SkinnedMesh;
    expect(skin.isSkinnedMesh).toBe(true);
    expect(skin.geometry.getAttribute('position').normalized).toBe(true);
    // Skin dequantization is folded into inverse bind matrices, not a nodeScale entry.
    expect(runtime.delivery.nodeScale.some((entry) => entry.node.includes('Skin'))).toBe(false);
    expect(skin.skeleton.boneInverses[0]!.equals(mesh.skeleton.boneInverses[0]!)).toBe(false);
    const sample = (scene: THREE.Object3D, target: THREE.SkinnedMesh) => {
      scene.updateMatrixWorld(true);
      target.skeleton.update();
      return Array.from({ length: target.geometry.getAttribute('position').count }, (_, i) =>
        target.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(target.matrixWorld),
      );
    };
    for (const angle of [0, 0.35, 0.7]) {
      tip.rotation.z = angle;
      find(loaded.scene, 'Tip').rotation.z = angle;
      const expected = sample(root, mesh);
      const actual = sample(loaded.scene, skin);
      expect(actual).toHaveLength(expected.length);
      // Vertex reordering is allowed; every exported point must remain within 1 mm.
      for (const point of actual)
        expect(Math.min(...expected.map((candidate) => candidate.distanceTo(point)))).toBeLessThan(
          0.001,
        );
      for (const point of expected)
        expect(Math.min(...actual.map((candidate) => candidate.distanceTo(point)))).toBeLessThan(
          0.001,
        );
    }
  });
});

/** A KTX2 header with the identifier and pixel size; enough for the manifest to read. */
function fakeKtx2(width: number, height: number, marker = 0): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  bytes[79] = marker;
  return bytes;
}
/** Read a delivered GLB back as a glTF-Transform document. */
async function readDelivered(glb: Uint8Array) {
  await MeshoptDecoder.ready;
  return createGltfIO().registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(glb);
}
/** One triangle whose material uses `base` as base colour and `normal` as normal map. */
async function twoSlotGlb(shared: boolean) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type: 'VEC2' | 'VEC3', values: number[]) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const png = (value: number) => new Uint8Array(encodePng(new Uint8Array(12).fill(value), 2, 2));
  const base = doc.createTexture('base').setImage(png(200)).setMimeType('image/png');
  const normal = shared
    ? base
    : doc.createTexture('normal').setImage(png(128)).setMimeType('image/png');
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('TEXCOORD_0', accessor('VEC2', [0, 0, 1, 0, 0, 1]))
    .setMaterial(doc.createMaterial('M').setBaseColorTexture(base).setNormalTexture(normal));
  doc
    .createScene('S')
    .addChild(doc.createNode('N').setMesh(doc.createMesh('N').addPrimitive(primitive)));
  return new WebIO().writeBinary(doc);
}

describe('KTX2 encoding through the hook', () => {
  test('atlas references are refreshed to the encoded KTX2 bytes and match the manifest', async () => {
    const rendered = await renderGLBInProcess(BUNKER);
    const source = new Uint8Array(rendered.glb);
    const output = await exportAssetGlb(assetRecord(source), {
      profile: 'runtime',
      target: 'three',
      textures: 'manifest',
      ktx2Encoder: async ({ image }) => fakeKtx2(1024, 1024, image.byteLength % 251),
    });
    if (output.profile !== 'runtime') throw new Error('expected runtime');
    const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
    expect(metadata.delivery.ktx2).toMatchObject({ status: 'encoded' });
    expect(metadata.delivery.preserved.lodChains).toBeGreaterThan(0);
    const doc = await readDelivered(output.glb);
    // Import validation accepts the delivered atlas: its final image identity is the KTX2.
    await validateAtlasDocumentProvenance(doc);
    const references = doc
      .getRoot()
      .listMaterials()
      .flatMap((material) => [material.getBaseColorTextureInfo()])
      .map((info) => info?.getExtras().kilnAtlasReference as Record<string, string> | undefined)
      .filter((reference) => reference !== undefined);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      const entry = metadata.textures.find(
        (candidate: { sha256: string }) => candidate.sha256 === reference.finalImageSha256,
      );
      expect(entry).toMatchObject({ mimeType: 'image/ktx2', width: 1024, height: 1024 });
      expect(reference.finalMime).toBe(entry.mimeType);
      expect(entry.sourceSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.sourceSha256).not.toBe(entry.sha256);
    }
  });

  test('the hook input names the slot and the output must carry the KTX2 identifier', async () => {
    const bytes = await twoSlotGlb(false);
    const calls: string[] = [];
    await deliverThreeRuntimeGlb(bytes, {
      ktx2Encoder: async ({ slot, colorSpace }) => {
        calls.push(`${slot}:${colorSpace}`);
        return fakeKtx2(2, 2);
      },
    });
    expect(calls).toEqual(['baseColor:srgb', 'normal:linear']);
    await expect(
      deliverThreeRuntimeGlb(bytes, { ktx2Encoder: async () => new Uint8Array(80) }),
    ).rejects.toThrow(/KTX2 identifier/);
  });

  test('an image used by both an sRGB and a linear slot cannot be encoded once', async () => {
    const bytes = await twoSlotGlb(true);
    // Without an encoder the image is delivered unchanged.
    expect((await deliverThreeRuntimeGlb(bytes)).delivery.ktx2.status).toBe('skipped');
    await expect(
      deliverThreeRuntimeGlb(bytes, { ktx2Encoder: async () => fakeKtx2(2, 2) }),
    ).rejects.toThrow(/both sRGB and linear/);
  });
});
