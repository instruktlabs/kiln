import { describe, expect, test } from 'bun:test';
import * as THREE from 'three/webgpu';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import golden from '../../fixtures/world.json';
import layoutData from '../../fixtures/layout.json';
import { integerHash, snapshotGeometry } from '../../scripts/golden-utils';
import * as site from '../../src/world/site-layout';
import { makeTerrainGeometry } from '../../src/world/terrain';
import { makeSurroundingTerrainGeometry } from '../../src/world/landscape';
import { addWoodland, woodlandPlacements } from '../../src/world/woodland';
import { makeStreamGeometry } from '../../src/world/stream-geometry';
import { createStreamMaterial } from '../../src/world/stream-material';
import { makeBridge } from '../../src/world/bridge';
import { createGroundMaterials, meadowPixels } from '../../src/world/meadow';
import { packInstancedMeshes, assertInstancingSafe } from '../../../scene-kit/src/instancing/core';
import { createSceneClock } from '../../../scene-kit/src/lifecycle/core';
import type { FarmLayout } from '../../src/world/types';

const layout = layoutData as FarmLayout;
function floats(actual: unknown, expected: unknown, path = 'value') {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(1e-6);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((value, index) => floats((actual as unknown[])[index], value, `${path}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) floats((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
  } else expect(actual, path).toEqual(expected);
}
function checkGeometry(geometry: THREE.BufferGeometry, expected: typeof golden.geometries.terrain | typeof golden.geometries.bridge) {
  const actual = snapshotGeometry(geometry);
  expect(actual.vertices).toBe(expected.vertices);
  expect(actual.triangles).toBe(expected.triangles);
  expect(actual.groups).toEqual(expected.groups);
  expect(actual.index).toEqual(expected.index);
  floats(actual, expected);
}

describe('Farm sealed r33 world goldens', () => {
  test('U-05: seven site functions at 200 fixed points match the pilot', () => {
    expect(golden.site.length).toBe(200);
    for (const point of golden.site) {
      const { x, z } = point;
      floats({ x, z, riverCenter: site.riverCenter(x), riverWidth: site.riverWidth(x), riverSlope: site.riverSlope(x), terrainHeight: site.terrainHeight(x, z), onBridge: site.onBridge(x, z), drivingHeight: site.drivingHeight(x, z), grassAllowed: site.grassAllowed(x, z, layout) }, point);
    }
  });
  test('U-06: terrain, surrounding, stream and bridge counts, groups, bounds, samples, sums and integer hashes', () => {
    const terrain = makeTerrainGeometry(layout), surrounding = makeSurroundingTerrainGeometry();
    const stream = makeStreamGeometry([terrain, surrounding]);
    const timber = new THREE.MeshStandardMaterial(), bridge = makeBridge(timber);
    try {
      checkGeometry(terrain, golden.geometries.terrain);
      checkGeometry(surrounding, golden.geometries.surrounding);
      checkGeometry(stream, golden.geometries.stream);
      checkGeometry(bridge.geometry, golden.geometries.bridge);
      expect(terrain.groups.length).toBe(3); expect(surrounding.groups.length).toBe(2);
      expect(bridge.material).toBe(timber); expect(bridge.castShadow && bridge.receiveShadow).toBe(true);
    } finally { for (const geometry of [terrain, surrounding, stream, bridge.geometry]) geometry.dispose(); timber.dispose(); }
  });
  test('U-07: every woodland point matches, 16 cells become exactly 8 synthetic packed groups', () => {
    const points = woodlandPlacements();
    expect(points.length).toBe(843); floats(points, golden.woodland.points);
    const scene = new THREE.Scene(), model = new THREE.Group(), sources: THREE.Mesh[] = [];
    const normal = new THREE.Texture();
    for (let i = 0; i < 4; i++) {
      const geometry = new THREE.BoxGeometry(1, i + 1, 1);
      if (i === 0) geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 4), 4));
      const source = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ normalMap: i === 0 ? normal : null }));
      source.name = `source-${i}`; source.position.y = i * .1; model.add(source); sources.push(source);
    }
    let originalDisposals = 0, derivedDisposals = 0;
    sources[0]!.geometry.addEventListener('dispose', () => originalDisposals++);
    const forest = addWoodland(scene, model);
    expect(forest.trees).toBe(843); expect(forest.cells).toBe(16); expect(forest.meshes.length).toBe(64);
    expect(forest.derivatives).toBe(1); expect(assertInstancingSafe(scene)).toEqual([]);
    for (const cell of golden.woodland.cells) {
      const meshes = forest.meshes.filter(mesh => mesh.name.startsWith('Boundary woodland ' + cell.key + ' '));
      expect(meshes.length).toBe(4);
      for (const mesh of meshes) expect(mesh.count).toBe(cell.count);
    }
    const derivatives = new Set(forest.meshes.filter(mesh => mesh.name.endsWith('source-0')).map(mesh => mesh.geometry));
    expect(derivatives.size).toBe(1); [...derivatives][0]!.addEventListener('dispose', () => derivedDisposals++);
    expect(sources[0]!.geometry.hasAttribute('tangent')).toBe(true);
    const packed = packInstancedMeshes(scene, forest.meshes);
    expect(packed.groups).toBe(8); expect(packed.instances).toBe(843 * 4); expect(assertInstancingSafe(scene)).toEqual([]);
    packed.restore(); forest.dispose(); forest.dispose();
    expect(scene.children.length).toBe(0); expect(derivedDisposals).toBe(1); expect(originalDisposals).toBe(0);
    for (const source of sources) { source.geometry.dispose(); (source.material as THREE.Material).dispose(); }
    normal.dispose();
  });
  test('U-08: all 256² RGBA meadow bytes match three exact integer hashes', () => {
    const pixels = meadowPixels(256);
    expect(pixels.size).toBe(golden.meadow.size); expect(pixels.color.length).toBe(golden.meadow.length);
    for (const name of ['color', 'roughness', 'normal'] as const) expect(integerHash(pixels[name])).toBe(golden.meadow[name]);
    expect(() => integerHash(new Float32Array([1]))).toThrow('integer buffers');
  });
  test('ground texture spaces, repeat and path clones preserve the pilot material look', () => {
    const source = new THREE.MeshStandardMaterial({ color: 0x736149 });
    const [meadow, path, soil] = createGroundMaterials(source);
    expect(path).not.toBe(soil); expect(soil).not.toBe(source); expect(source.color.getHex()).toBe(0x736149);
    expect(path.color.getHex()).toBe(0xe3c6a0); expect(path.normalScale.toArray()).toEqual([.2, .2]);
    expect(meadow.normalScale.toArray()).toEqual([.4, .4]); expect(meadow.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const texture of [meadow.map!, meadow.roughnessMap!, meadow.normalMap!]) {
      expect(texture.repeat.toArray()).toEqual([1 / 3, 1 / 3]); expect(texture.generateMipmaps).toBe(true);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping); expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter); texture.dispose();
    }
    expect(meadow.normalMap!.colorSpace).toBe(THREE.NoColorSpace); expect(meadow.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    for (const material of [source, meadow, path, soil]) material.dispose();
    const water = createStreamMaterial(createSceneClock());
    expect(water.name).toBe('Farm flowing stream v1'); expect(water.transparent).toBe(true); expect(water.depthWrite).toBe(false); water.dispose();
  });
});

test.skipIf(process.env.ORACLE !== '1')('opt-in live oracle matches frozen source hashes and numeric geometry', async () => {
  const root = resolve(import.meta.dir, '../../../../.tmp/pilot-r33/scene');
  for (const [file, hash] of Object.entries(golden.oracle.sources)) expect(createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')).toBe(hash);
  const load = (name: string) => import(pathToFileURL(resolve(root, name)).href);
  const [siteOracle, terrain, landscape, stream, meadow, bridge] = await Promise.all(['site-layout.mjs', 'terrain.mjs', 'landscape.mjs', 'stream-geometry.mjs', 'meadow-material.mjs', 'bridge.mjs'].map(load));
  for (const point of golden.site) for (const key of ['riverCenter', 'riverWidth', 'riverSlope', 'terrainHeight', 'onBridge', 'drivingHeight', 'grassAllowed'] as const) floats(key === 'grassAllowed' ? siteOracle[key](point.x, point.z, layout) : siteOracle[key](point.x, point.z), point[key]);
  const ground = terrain.makeTerrainGeometry(THREE, layout), surround = landscape.makeSurroundingTerrainGeometry(THREE), water = stream.makeStreamGeometry(THREE, [ground, surround]), material = new THREE.MeshStandardMaterial(), crossing = bridge.makeBridge(THREE, material);
  checkGeometry(ground, golden.geometries.terrain); checkGeometry(surround, golden.geometries.surrounding); checkGeometry(water, golden.geometries.stream); checkGeometry(crossing.geometry, golden.geometries.bridge);
  floats(landscape.woodlandPlacements(), golden.woodland.points);
  const pixels = meadow.meadowPixels(256); for (const name of ['color', 'roughness', 'normal'] as const) expect(integerHash(pixels[name])).toBe(golden.meadow[name]);
  for (const geometry of [ground, surround, water, crossing.geometry]) geometry.dispose(); material.dispose();
});
