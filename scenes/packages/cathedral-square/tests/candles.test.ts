import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
await import('three');
const { Box3, Mesh, Raycaster, Vector3 } = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { buildCandles, candlePulse, findCandleTips, interiorBounceWeight, interiorBounceDirection, createInteriorBounce } = await import('../src/candles');
const bytes = readFileSync(new URL('../standalone/public/assets/models/cathedral.glb', import.meta.url));
const loader = new GLTFLoader();
loader.register(() => ({ name: 'candle-image-free', loadTexture: async () => null }));
const cathedral = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;

test('all six flames attach to the existing exported candle tips, preserving borrowed meshes', () => {
  const tips = findCandleTips(cathedral);
  expect(tips).toHaveLength(6);
  for (const [i, tip] of tips.entries()) {
    expect(tip.x).toBeCloseTo(-56.6, 4); expect(tip.y).toBeCloseTo(2.58, 4);
    expect(tip.z).toBeCloseTo(-1.5 + i * .6, 4);
  }
  let borrowedDisposals = 0;
  cathedral.traverse(node => { if ((node as InstanceType<typeof Mesh>).isMesh) (node as InstanceType<typeof Mesh>).geometry.addEventListener('dispose', () => borrowedDisposals++); });
  const candles = buildCandles(cathedral);
  expect(candles.stats.flames).toBe(6); expect(candles.lights).toHaveLength(2);
  const owned = new Set<object>(); let released = 0;
  candles.root.traverse(node => {
    if (!(node as InstanceType<typeof Mesh>).isMesh) return;
    const mesh = node as InstanceType<typeof Mesh>;
    expect(mesh.material).toHaveProperty('depthTest', true);
    for (const resource of [mesh.geometry, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]) {
      if (owned.has(resource)) continue; owned.add(resource); resource.addEventListener('dispose', () => released++);
    }
  });
  expect(owned.size).toBeGreaterThan(0);
  candles.dispose(); candles.dispose();
  expect(released).toBe(owned.size); expect(borrowedDisposals).toBe(0);
});

test('candle light is range-limited and shadowed, cached, and safely absent without shadows', () => {
  const candles = buildCandles(cathedral), low = buildCandles(cathedral, { shadows: true, tier: 'minimal' });
  const unshadowed = buildCandles(cathedral, { shadows: false, tier: 'minimal' });
  try {
    expect(candles.stats.shadowMaps).toBe(2); expect(low.stats.shadowMaps).toBe(1);
    for (const light of candles.lights) {
      expect(light.castShadow).toBe(true); expect(light.distance).toBeLessThanOrEqual(12);
      expect(light.shadow.autoUpdate).toBe(false); expect(light.shadow.mapSize.x).toBeLessThanOrEqual(512);
    }
    expect(unshadowed.lights).toHaveLength(0); expect(unshadowed.stats.flames).toBe(6);
  } finally { candles.dispose(); low.dispose(); unshadowed.dispose(); }
});

test('actual sanctuary masonry intercepts rays from the candles before the floor behind a choir pier', () => {
  const candles = buildCandles(cathedral), source = candles.lights[1].position;
  const floor = new Vector3(-57.9, .06, 10), direction = floor.clone().sub(source), distance = direction.length();
  const ray = new Raycaster(source, direction.normalize(), .04, distance);
  const column = cathedral.getObjectByName('Mesh_ChoirPier3_N_Stone')!;
  try {
    const hit = ray.intersectObject(column, false)[0];
    expect(hit).toBeDefined(); expect(hit.distance).toBeLessThan(distance);
    expect(hit.distance).toBeLessThan(candles.lights[1].distance);
    // Runtime uses this opaque mesh in the ordinary point-shadow pass; the floor
    // cannot be considered exposed merely because it is within the light range.
    expect(candles.lights[1].shadow.camera.far).toBeGreaterThan(distance);
  } finally { candles.dispose(); }
});

test('interior bounce improves nave and sanctuary without changing exterior, roof or outside walls', () => {
  expect(interiorBounceWeight(new Vector3(-55, 5, 0))).toBeGreaterThan(.8);
  expect(interiorBounceWeight(new Vector3(20, 3, 10))).toBeGreaterThan(.5);
  for (const point of [[65, 3, 0], [-55, 3, 14], [-55, 44, 0], [75, 0, 35], [-80, 4, 16]]) {
    expect(interiorBounceWeight(new Vector3(...point))).toBe(0);
  }
});

test('bounce reaches the actual seven chapel figure supports, ambulatory and transept aisles but not gaps outside', () => {
  cathedral.updateWorldMatrix(true, true);
  for (let i = 0; i < 7; i++) {
    const plinth = cathedral.getObjectByName(`Mesh_ChapelFigure_Plinth_${i}`)!;
    expect(plinth).toBeDefined();
    const point = new Box3().setFromObject(plinth).getCenter(new Vector3()); point.y = 3;
    expect(interiorBounceWeight(point)).toBeGreaterThan(.55);
  }
  for (const point of [[-67, 3, 0], [-31.1, 3, 23], [-21, 3, -20]]) {
    expect(interiorBounceWeight(new Vector3(...point))).toBeGreaterThan(.6);
  }
  for (const point of [[-16, 3, 20], [-31.1, 3, 29], [-76.5, 3, 0], [-57.4, 3, 18]]) {
    expect(interiorBounceWeight(new Vector3(...point))).toBe(0);
  }
  // At the angular gaps, a circular apse bounding box would incorrectly light exterior buttresses.
  for (let k = 1; k < 7; k++) {
    const angle = -k * Math.PI / 7;
    expect(interiorBounceWeight(new Vector3(-57.4 + 16 * Math.sin(angle), 3, 16 * Math.cos(angle)))).toBe(0);
  }
  expect(interiorBounceWeight(new Vector3(-73.17, 18, 0))).toBe(0);
  expect(interiorBounceWeight(new Vector3(-31.1, 30, 20))).toBeLessThan(interiorBounceWeight(new Vector3(-31.1, 3, 20)));
});

test('practicals provide restrained local warmth rather than a dominant altar hotspot', () => {
  const candles = buildCandles(cathedral), low = buildCandles(cathedral, { shadows: true, tier: 'minimal' });
  try {
    for (const light of candles.lights) expect(light.intensity).toBeLessThanOrEqual(2.5);
    expect(low.lights[0].intensity).toBeLessThanOrEqual(4);
  } finally { candles.dispose(); low.dispose(); }
});

test('inner aisle and chapel wall surfaces receive bounce while their outer faces remain unchanged', () => {
  const rearChapelInnerX = -57.4 - (13.1 * Math.cos(Math.PI / 14) + 3) - 2.5 * Math.cos(21.6 * Math.PI / 180);
  for (const point of [[20, 4, 13.1], [20, 4, -13.1], [rearChapelInnerX, 4, 0]]) {
    expect(interiorBounceWeight(new Vector3(...point))).toBeGreaterThan(.8);
  }
  for (const point of [[20, 4, 14], [20, 4, -14], [rearChapelInnerX - .5, 4, 0]]) {
    expect(interiorBounceWeight(new Vector3(...point))).toBe(0);
  }
  const center = interiorBounceWeight(new Vector3(20, .06, 10));
  expect(interiorBounceWeight(new Vector3(20, .06, 12.8))).toBeCloseTo(center, 3);
});

test('diffuse bounce preserves modeled lit and shaded sculpture planes without a black unlit side', () => {
  const toward = new Vector3(.38, .74, -.55).normalize(), away = toward.clone().negate();
  expect(interiorBounceDirection(toward)).toBeCloseTo(1.2, 6);
  expect(interiorBounceDirection(away)).toBeCloseTo(.45, 6);
  expect(interiorBounceDirection(toward)).toBeGreaterThan(interiorBounceDirection(away) * 2);
  expect(interiorBounceDirection(new Vector3(0, 1, 0))).toBeGreaterThan(interiorBounceDirection(new Vector3(0, -1, 0)));
});

test('the bounded footprint texture includes rear chapels, excludes outdoor gaps and disposes once', () => {
  const bounce = createInteriorBounce(), image = bounce.field.image;
  let released = 0; bounce.field.addEventListener('dispose', () => released++);
  expect(image.width).toBe(512); expect(image.height).toBe(256); expect(image.data.byteLength).toBe(524288);
  const sample = (x: number, z: number) => {
    const col = Math.floor((x + 80) / 144 * image.width), row = Math.floor((z + 30) / 60 * image.height), at = (row * image.width + col) * 4;
    return Math.max(image.data[at], image.data[at + 1], image.data[at + 2]) / 255;
  };
  expect(sample(-73.17, 0)).toBeGreaterThan(.55);
  for (const [x, z] of [[65, 0], [-76.5, 0], [-31.1, 29], [-16, 20]]) expect(sample(Math.min(x, 63), z)).toBe(0);
  for (let k = 1; k < 7; k++) {
    const angle = -k * Math.PI / 7;
    expect(sample(-57.4 + 16 * Math.sin(angle), 16 * Math.cos(angle))).toBe(0);
  }
  bounce.dispose(); bounce.dispose(); expect(released).toBe(1);
});

test('flicker is deterministic, restrained, independent per candle, and static with reduced motion', () => {
  expect(candlePulse(1, 0, false)).not.toBe(candlePulse(1, 1, false));
  for (let frame = 0; frame < 200; frame++) {
    const time = frame / 60, value = candlePulse(time, 2, false);
    expect(value).toBe(candlePulse(time, 2, false));
    expect(value).toBeGreaterThanOrEqual(.94); expect(value).toBeLessThanOrEqual(1.06);
    expect(candlePulse(time, 2, true)).toBe(1);
  }
});
