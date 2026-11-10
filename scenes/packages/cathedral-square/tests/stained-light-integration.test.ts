import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
await import('three');
const { DataTexture, Matrix3, Mesh, Raycaster, SRGBColorSpace, Vector3 } = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { createStainedSurfaceProbe, buildStainedLight } = await import('../src/stained-light');
const { afternoonSunDirection } = await import('../src/light');
const bytes = readFileSync(new URL('../standalone/public/assets/models/cathedral.glb', import.meta.url));
const loader = new GLTFLoader();
loader.register(parser => ({ name: 'cpu-png-atlases', loadTexture: async (index: number) => {
  const texture = parser.json.textures[index], image = parser.json.images[texture.source];
  const png = PNG.sync.read(Buffer.from(await parser.getDependency('bufferView', image.bufferView)));
  const map = new DataTexture(new Uint8Array(png.data), png.width, png.height); map.flipY = false; map.colorSpace = SRGBColorSpace; return map;
} }));
const cathedral = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;

test('the exported cathedral pier receives stained sunlight while its projected floor shadow stays dark', () => {
  const sun = new Vector3().copy(afternoonSunDirection()), horizontal = sun.clone().setY(0).normalize();
  const probe = createStainedSurfaceProbe(cathedral);
  cathedral.updateWorldMatrix(true, true);
  const witnesses: { name: string; point: number[]; floor: number[]; color: number[] }[] = [];
  const ray = new Raycaster(), normalMatrix = new Matrix3();
  try {
    for (let bay = 1; bay < 10 && witnesses.length < 3; bay++) {
      const mesh = cathedral.getObjectByName(`Mesh_NavePier${bay}_S_Stone`) as InstanceType<typeof Mesh>;
      expect(mesh?.isMesh).toBe(true);
      const center = new Vector3(48 - bay * 6.6, 0, -6.5);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let height = .8; height < 12; height += .2) {
        const origin = center.clone().addScaledVector(horizontal, 4); origin.y = height;
        ray.set(origin, horizontal.clone().negate());
        const hit = ray.intersectObject(mesh, false)[0];
        if (!hit?.face) continue;
        const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix);
        const sample = probe.sample(hit.point, normal);
        if (!sample.filtered || sample.shadowed || Math.max(...sample.color) < .08) continue;
        const floor = hit.point.clone().addScaledVector(sun, -(hit.point.y - .06) / sun.y);
        const blocked = probe.sample(floor, new Vector3(0, 1, 0));
        expect(blocked.shadowed).toBe(true);
        expect(blocked.color).toEqual([0, 0, 0]);
        witnesses.push({ name: mesh.name, point: hit.point.toArray(), floor: floor.toArray(), color: sample.color });
        break;
      }
    }
    expect(witnesses.length).toBe(3);
    console.log('Exact cathedral surface witnesses', JSON.stringify(witnesses));
  } finally { probe.dispose(); }
});

test('the final exported glass produces a bounded sun-space field without floor overlay geometry', () => {
  const started = performance.now(), light = buildStainedLight(cathedral);
  try {
    expect(light.stats.samples).toBeGreaterThan(10000);
    expect(light.stats.samples).toBeLessThanOrEqual(262144);
    expect(light.stats.litSamples).toBeGreaterThan(1000);
    expect(light.root.children).toHaveLength(0);
    expect(light.projection).not.toBeNull();
    console.log('Exported glass field', JSON.stringify({ ...light.stats, width: light.projection!.width, height: light.projection!.height, buildMs: performance.now() - started }));
  } finally { light.dispose(); }
});
