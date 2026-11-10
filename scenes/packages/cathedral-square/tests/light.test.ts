import { expect, test } from 'bun:test';
await import('three');
const { OrthographicCamera, Vector3 } = await import('three/webgpu');
const { AFTERNOON, afternoonSunDirection } = await import('../src/light');
test('the static shadow frustum covers the cathedral and resolves walls below 12 cm per texel', () => {
  expect(AFTERNOON.shadowExtent * 2 / AFTERNOON.shadowMapSize).toBeLessThan(.12);
  const extent = AFTERNOON.shadowExtent;
  const camera = new OrthographicCamera(-extent, extent, extent, -extent, AFTERNOON.shadowNear, AFTERNOON.shadowFar);
  const focus = new Vector3(...AFTERNOON.shadowFocus), direction = afternoonSunDirection();
  camera.position.copy(focus).addScaledVector(new Vector3(direction.x, direction.y, direction.z), AFTERNOON.lightDistance);
  camera.lookAt(focus); camera.updateMatrixWorld(true);
  for (const x of [-80, 84]) for (const y of [0, 106]) for (const z of [-35, 35]) {
    const ndc = new Vector3(x, y, z).project(camera);
    expect(Math.abs(ndc.x)).toBeLessThan(1);
    expect(Math.abs(ndc.y)).toBeLessThan(1);
    expect(Math.abs(ndc.z)).toBeLessThan(1);
  }
});
