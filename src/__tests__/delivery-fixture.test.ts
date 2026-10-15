/**
 * End-to-end delivery fixture (delivery contract item 8).
 *
 * `fixtures/bunker-door-frame.kiln.js` is one kit.module with two ports, a box collider,
 * three anchors, a two-tier defineLod plus an impostor, baked _EDGE/_CAVITY, a packed atlas
 * with two procedural regions, a budget, a required solid and instanced bolts. It renders
 * through both converters, and its three.js runtime export is qualified through three's
 * GLTFLoader with the meshopt decoder (the item 6 qualification).
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportAssetGlb } from '../asset-export';
import type { AssetRecord } from '../assets';
import { renderGLBInProcess } from '../render';

const FIXTURE = readFileSync(resolve('src/__tests__/fixtures/bunker-door-frame.kiln.js'), 'utf8');
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const record = (bytes: Uint8Array): AssetRecord => ({
  manifest: {
    version: 'kiln.asset.v1',
    assetId: 'a_bunker',
    revisionId: 'r_bunker',
    name: 'BunkerDoorFrame',
    tags: [],
    createdAt: '2026-10-15T00:00:00.000Z',
    editable: false,
    files: { 'asset.glb': { bytes: bytes.length, sha256: sha(bytes) as `sha256:${string}` } },
  },
  files: { 'asset.glb': bytes },
});
const glbJson = (bytes: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(
      bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)),
    ),
  );
const find = (root: THREE.Object3D, name: string) => {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};

describe('bunker door frame fixture', () => {
  for (const gltfExporter of ['legacy', 'three'] as const)
    test(`delivers every contract element (${gltfExporter} converter, three target)`, async () => {
      const rendered = await renderGLBInProcess(FIXTURE, { gltfExporter });
      const source = new Uint8Array(rendered.glb);
      const manifest = rendered.integrationManifest;

      // Editable GLB: the manifest lists every delivery element.
      expect(manifest.kit).toMatchObject({ name: 'BunkerDoorFrame', footprint: [3.2, 0.6] });
      expect(manifest.ports!.map((p) => p.id)).toEqual(['west', 'east']);
      expect(manifest.colliders!.map((c) => c.role)).toEqual(['collider.box.frame']);
      const shape = manifest.colliders![0]!.shape;
      if (shape.kind !== 'box') throw new Error('expected a box collider');
      [3.2, 3.2, 0.6].forEach((size, axis) => {
        expect(shape.size[axis]).toBeCloseTo(size, 5);
      });
      expect(manifest.anchors!.map((a) => a.role)).toEqual([
        'anchor.door.main',
        'anchor.light.lintel',
        'anchor.decal.stencil',
      ]);
      const [chain] = manifest.levelsOfDetail!;
      expect(chain!.levels).toHaveLength(3);
      expect(chain!.levels.map((level) => level.impostor === true)).toEqual([false, false, true]);
      expect(manifest.vertexAttributes!.map((a) => a.name)).toEqual(['_EDGE', '_CAVITY']);
      expect(manifest.budget!.status).toBe('pass');
      expect(manifest.deliveryDiagnostics).toBeUndefined();
      expect(manifest.structuralQa.validatorErrors).toBe(0);
      // The atlas was packed: compiler v1.2, both regions placed by the packer.
      const [atlas] = glbJson(source).scenes[0].extras.kilnAtlasProvenance.atlases;
      expect(atlas.manifest.compilerId).toBe('kiln.texture-atlas.v1.2');
      expect(
        atlas.spec.regions.map((r: { name: string; packed?: true }) => [r.name, r.packed]),
      ).toEqual([
        ['concrete', true],
        ['steel', true],
      ]);

      // three.js runtime target, loaded the way an application loads it.
      const output = await exportAssetGlb(record(source), {
        profile: 'runtime',
        target: 'three',
        metadataFileName: 'bunker.kiln-metadata.json',
      });
      if (output.profile !== 'runtime') throw new Error('expected runtime');
      const delivery = JSON.parse(new TextDecoder().decode(output.metadata.bytes)).delivery;
      expect(delivery.instancing).toEqual([
        expect.objectContaining({
          count: 6,
          instances: [0, 1, 2, 3, 4, 5].map((i) => `Mesh_Bolt_${i}`),
        }),
      ]);
      expect(delivery.preserved).toMatchObject({
        lodChains: 1,
        colliders: 1,
        anchors: 3,
        ports: 2,
        kitModules: 1,
      });
      expect(
        delivery.nodeScale.some((entry: { node: string }) => entry.node.includes('Mesh_Frame')),
      ).toBe(true);

      await MeshoptDecoder.ready;
      const gltf = await new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(Uint8Array.from(output.glb).buffer, '');
      const scene = gltf.scene;
      // The scene shares the root's name and GLTFLoader makes names unique, so take the
      // asset root as the scene's only child.
      expect(scene.children).toHaveLength(1);
      const root = scene.children[0]!;
      expect(root.userData.kilnSemantic.roles).toContain('kit.module');
      expect(root.userData.kilnKit).toMatchObject({ footprint: [3.2, 0.6], height: 3.2 });
      for (const name of [
        'Port_west',
        'Port_east',
        'Anchor_door_main',
        'Anchor_light_lintel',
        'Anchor_decal_stencil',
      ])
        expect(find(scene, name).userData.kilnSemantic.roles).toHaveLength(1);
      const collider = find(scene, 'Collider_box_frame');
      expect(collider.userData.gltfExtensions.KHR_node_visibility).toEqual({ visible: false });
      [3.2, 3.2, 0.6].forEach((size, axis) => {
        expect(collider.scale.getComponent(axis)).toBeCloseTo(size, 5);
      });
      const frame = find(scene, 'Mesh_Frame') as THREE.Mesh;
      const edge = frame.geometry.getAttribute('_edge');
      const cavity = frame.geometry.getAttribute('_cavity');
      expect(edge.array).toBeInstanceOf(Float32Array);
      expect(cavity.array).toBeInstanceOf(Float32Array);
      expect(Math.max(...edge.array)).toBe(1);
      // Quantized positions: the frame's node carries the metre scale.
      expect(frame.scale.x).toBeGreaterThan(1);
      const instanced: THREE.InstancedMesh[] = [];
      scene.traverse((object) => {
        if ((object as THREE.InstancedMesh).isInstancedMesh) instanced.push(object as never);
      });
      expect(instanced.map((mesh) => mesh.count)).toEqual([6]);
      const lod0 = find(scene, 'Frame_LOD0');
      const ids = lod0.userData.gltfExtensions.MSFT_lod.ids as number[];
      expect(ids).toHaveLength(2);
      const levels = await Promise.all(
        ids.map((id) => gltf.parser.getDependency('node', id) as Promise<THREE.Object3D>),
      );
      expect(levels.map((level) => level.name)).toEqual(['Frame_LOD1', 'Frame_LOD2']);
      expect(levels[1]!.userData.kilnSemantic.roles).toContain('lod.impostor');
    });
});
