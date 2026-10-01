import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { integerHash, siteSamplePoints, snapshotGeometry } from './golden-utils';

// The stage-assets verification step supplies this read-only extracted oracle.
// Never imports the port: regenerating a fixture must continue to measure the sealed pilot.
const farm = fileURLToPath(new URL('../', import.meta.url));
const oracle = resolve(farm, '../../.tmp/pilot-r33/scene');
const oracleUrl = new URL('../../../.tmp/pilot-r33/scene/', import.meta.url);
const files = ['site-layout.mjs', 'terrain.mjs', 'landscape.mjs', 'stream-geometry.mjs', 'meadow-material.mjs', 'bridge.mjs', 'layout.json'];
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const verification = JSON.parse(await readFile(resolve(farm, '../../evidence/m2/staging/r33.json'), 'utf8'));
assert.equal(verification.verification.ok, true, 'Stage and verify r33 before using the oracle');
assert.equal(resolve(verification.oracle, 'scene'), oracle);
const delivery = JSON.parse(await readFile(resolve(oracle, '../delivery.json'), 'utf8'));
const sources = Object.fromEntries(await Promise.all(files.map(async file => {
  const bytes = await readFile(resolve(oracle, file)), hash = sha256(bytes), receipt = delivery.files['scene/' + file];
  assert.equal(bytes.length, receipt?.bytes, `${file}: sealed byte count differs`);
  assert.equal('sha256:' + hash, receipt?.sha256, `${file}: sealed hash differs`);
  return [file, hash];
})));
const fixturePath = resolve(farm, 'fixtures/world.json');
// A rerun is only permitted against the very same sealed source bytes.
try {
  const previous = JSON.parse(await readFile(fixturePath, 'utf8'));
  assert.deepEqual(sources, previous.oracle.sources, 'Source hashes changed: stop and investigate before replacing frozen goldens');
} catch (error) {
  if ((error as { code?: string }).code !== 'ENOENT') throw error;
}
assert.equal(THREE.REVISION, '186');
const load = (file: string) => import(new URL(file, oracleUrl).href);
const [site, terrain, landscape, stream, meadow, bridge] = await Promise.all(files.slice(0, 6).map(load));
const layout = JSON.parse(await readFile(resolve(oracle, 'layout.json'), 'utf8'));
const ground = terrain.makeTerrainGeometry(THREE, layout), surround = landscape.makeSurroundingTerrainGeometry(THREE);
const water = stream.makeStreamGeometry(THREE, [ground, surround]);
const timber = new THREE.MeshStandardMaterial(), crossing = bridge.makeBridge(THREE, timber);
const pixels = meadow.meadowPixels(256);
const points = landscape.woodlandPlacements();
const cells = new Map<string, number>();
for (const point of points) {
  const key = [Math.floor(point.x / 64), Math.floor(point.z / 64)].join('/');
  cells.set(key, (cells.get(key) ?? 0) + 1);
}
const fixture = {
  schema: 1,
  oracle: { release: 'r33', source: '.tmp/pilot-r33/scene', verification: 'evidence/m2/staging/r33.json', archiveSha256: verification.sourceMetadata.sceneZipSha256, sources, three: '0.186.0', tolerance: 1e-6, vertexStride: 97 },
  site: siteSamplePoints().map(([x, z]) => ({ x, z, riverCenter: site.riverCenter(x), riverWidth: site.riverWidth(x), riverSlope: site.riverSlope(x), terrainHeight: site.terrainHeight(x, z), onBridge: site.onBridge(x, z), drivingHeight: site.drivingHeight(x, z), grassAllowed: site.grassAllowed(x, z, layout) })),
  geometries: { terrain: snapshotGeometry(ground), surrounding: snapshotGeometry(surround), stream: snapshotGeometry(water), bridge: snapshotGeometry(crossing.geometry) },
  woodland: { trees: points.length, cells: [...cells].map(([key, count]) => ({ key, count })), points },
  meadow: { size: pixels.size, length: pixels.color.length, color: integerHash(pixels.color), roughness: integerHash(pixels.roughness), normal: integerHash(pixels.normal) },
};
assert.equal(fixture.geometries.terrain.vertices, 22475);
assert.equal(fixture.geometries.terrain.triangles, 44352);
assert.equal(fixture.geometries.surrounding.triangles, 39690);
assert.equal(fixture.geometries.stream.triangles, 12976);
assert.equal(fixture.geometries.bridge.triangles, 408);
assert.equal(points.length, 843);
assert.equal(cells.size, 16);
await mkdir(resolve(farm, 'fixtures'), { recursive: true });
await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + '\n');
// Freeze layout independently: regular tests never open staged data or the pilot.
await writeFile(resolve(farm, 'fixtures/layout.json'), await readFile(resolve(oracle, 'layout.json')));
for (const geometry of [ground, surround, water, crossing.geometry]) geometry.dispose();
timber.dispose();
console.log(JSON.stringify({ fixture: 'packages/farm/fixtures/world.json', counts: { terrainVertices: 22475, terrainTriangles: 44352, surroundingTriangles: 39690, streamTriangles: 12976, bridgeTriangles: 408, woodlandTrees: points.length, woodlandCells: cells.size }, meadow: fixture.meadow }));
