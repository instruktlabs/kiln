/**
 * The runtime derivative that minimizes draw calls: every repeat becomes a batch, the remaining
 * one-off parts merge per material within spatial cells, and the saved revision never changes.
 */
import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { exportAssetGlb } from '../asset-export';
import type { AssetRecord } from '../assets';
import { reduceDrawCalls } from '../draw-reduction';
import { createGltfIO } from '../gltf-io';
import { collectGlbMetrics } from '../metrics';
import {
  boxGeo,
  coneGeo,
  createInstance,
  createPart,
  createRoot,
  gameMaterial,
  planeGeo,
} from '../primitives';
import { renderSceneToGLB } from '../render';
import {
  REVIEW_DIRECTIONS,
  drawnFaces,
  facesDifference,
  loadThreeScene,
  wronglyWoundInstances,
} from './helpers/three-winding';

/** Two copies of a pane, a mirrored pair, three nearby one-offs, one far away, one blended. */
function buildingScene(): THREE.Object3D {
  const root = createRoot('Building');
  const stone = gameMaterial(0xc8c0a8);
  const pane = createPart('Pane0', planeGeo(1, 2), gameMaterial(0x803030), {
    position: [0, 1, 4],
    parent: root,
  });
  createInstance('Pane1', pane, { position: [3, 1, 4], parent: root });
  createInstance('MirrorPane0', pane, {
    position: [0, 1, 7],
    rotation: [0, 180, 0],
    scale: [1, 1, -1],
    parent: root,
  });
  createInstance('MirrorPane1', pane, {
    position: [3, 1, 7],
    rotation: [0, 180, 0],
    scale: [1, 1, -1],
    parent: root,
  });
  createPart('Wall', boxGeo(4, 3, 0.4), stone, { position: [0, 1.5, 0], parent: root });
  createPart('Pier', boxGeo(0.5, 3, 0.5), stone, { position: [3, 1.5, 0], parent: root });
  createPart('Spire', coneGeo(0.5, 2, 6), stone, {
    position: [6, 1, 0],
    scale: [1, 1, -1],
    parent: root,
  });
  createPart('FarPier', boxGeo(0.5, 3, 0.7), stone, { position: [100, 1.5, 0], parent: root });
  const decal = gameMaterial(0x202020);
  decal.transparent = true;
  decal.opacity = 0.5;
  createPart('Decal', planeGeo(1, 1), decal, { position: [0, 1, 0.3], parent: root });
  return root;
}

const sha = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as `sha256:${string}`;

function record(bytes: Uint8Array): AssetRecord {
  return {
    manifest: {
      version: 'kiln.asset.v1',
      assetId: 'a_draws',
      revisionId: 'r_draws',
      name: 'Draw Probe',
      tags: [],
      createdAt: '2026-11-07T00:00:00.000Z',
      editable: false,
      files: { 'asset.glb': { bytes: bytes.length, sha256: sha(bytes) } },
    },
    files: { 'asset.glb': bytes },
  };
}

async function expectSameFaces(before: Uint8Array, after: Uint8Array, tolerance?: number) {
  const a = await loadThreeScene(before);
  const b = await loadThreeScene(after);
  expect(wronglyWoundInstances(b)).toBe(0);
  let compared = 0;
  for (const direction of REVIEW_DIRECTIONS) {
    const expected = drawnFaces(a, direction);
    compared += expected.length;
    expect(facesDifference(drawnFaces(b, direction), expected, tolerance)).toEqual({
      extra: 0,
      missing: 0,
    });
  }
  expect(compared).toBeGreaterThan(0);
}

describe('reduceDrawCalls', () => {
  it('batches every repeat, merges one-offs per cell and material, and draws the same', async () => {
    const { bytes } = await renderSceneToGLB(buildingScene(), { instance: 'off' });
    const io = createGltfIO();
    const doc = await io.readBinary(bytes);
    const before = collectGlbMetrics(doc);
    const summary = await reduceDrawCalls(doc, { cellSize: 15 });
    const after = collectGlbMetrics(doc);

    // Pane pair, mirrored pane pair, near stone cell, far stone part, the blended decal.
    expect(after.drawCalls).toBe(5);
    expect(after.triangles).toBe(before.triangles);
    expect(summary).toMatchObject({
      drawsBefore: before.drawCalls,
      drawsAfter: 5,
      batches: 2,
      instances: 4,
      cellSize: 15,
    });
    expect(summary.rejected).toEqual([]);
    await expectSameFaces(bytes, await io.writeBinary(doc));
  });

  it('never splits accessors that parts already share', async () => {
    const root = createRoot('Shared');
    const geo = boxGeo(1, 1, 1);
    const stone = gameMaterial(0x999999);
    for (let i = 0; i < 4; i++)
      createPart(`Part${i}`, geo, stone, {
        position: [i * 2, 0.5, 0],
        rotation: [0, i * 30, 0],
        parent: root,
      });
    const { bytes } = await renderSceneToGLB(root, { instance: 'off' });
    const doc = await createGltfIO().readBinary(bytes);
    const accessors = doc.getRoot().listAccessors().length;
    await reduceDrawCalls(doc);
    const geometry = doc
      .getRoot()
      .listAccessors()
      .filter((accessor) => accessor.listParents().some((p) => p.propertyType === 'Primitive'));
    expect(geometry.length).toBeLessThanOrEqual(accessors);
    expect(collectGlbMetrics(doc).drawCalls).toBe(1);
  });

  it('leaves a part a consumer addresses alone', async () => {
    const root = createRoot('Rigged');
    const stone = gameMaterial(0x999999);
    createPart('Wall', boxGeo(4, 3, 0.4), stone, { parent: root });
    createPart('Pier', boxGeo(0.5, 3, 0.5), stone, { position: [3, 0, 0], parent: root });
    const joint = new THREE.Group();
    joint.name = 'Joint_Door';
    root.add(joint);
    createPart('Door', boxGeo(1, 2, 0.1), stone, { parent: joint });
    const { bytes } = await renderSceneToGLB(root, { instance: 'off' });
    const doc = await createGltfIO().readBinary(bytes);
    const summary = await reduceDrawCalls(doc);
    expect(summary.batches).toBe(0);
    const door = doc
      .getRoot()
      .listNodes()
      .find((node) => node.getName() === 'Mesh_Door');
    expect(door?.getMesh()).not.toBeNull();
  });
});

describe('--draws minimal runtime export', () => {
  it('derives a reduced GLB with a receipt and leaves the saved revision alone', async () => {
    const { bytes } = await renderSceneToGLB(buildingScene(), { instance: 'off' });
    const saved = Uint8Array.from(bytes);
    const asset = record(saved);
    const output = await exportAssetGlb(asset, { profile: 'runtime', draws: 'minimal' });
    if (output.profile !== 'runtime') throw new Error('expected runtime');
    expect(asset.files['asset.glb']).toEqual(bytes);

    const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
    expect(metadata.source.glbSha256).toBe(sha(saved));
    expect(metadata.drawReduction).toMatchObject({ drawsAfter: 5, batches: 2 });
    const doc = await createGltfIO().readBinary(output.glb);
    expect(collectGlbMetrics(doc).drawCalls).toBe(5);
    await expectSameFaces(bytes, output.glb);
  });

  it('composes with the three target', async () => {
    const { bytes } = await renderSceneToGLB(buildingScene(), { instance: 'off' });
    const output = await exportAssetGlb(record(Uint8Array.from(bytes)), {
      profile: 'runtime',
      target: 'three',
      draws: 'minimal',
    });
    if (output.profile !== 'runtime') throw new Error('expected runtime');
    await expectSameFaces(bytes, output.glb, 5e-3);
  });

  it('needs the runtime profile and a positive cell', async () => {
    const asset = record((await renderSceneToGLB(buildingScene(), { instance: 'off' })).bytes);
    await expect(exportAssetGlb(asset, { draws: 'minimal' })).rejects.toThrow(/runtime profile/);
    await expect(
      exportAssetGlb(asset, { profile: 'runtime', draws: 'minimal', drawCellSize: 0 }),
    ).rejects.toThrow(/positive/);
  });
});
