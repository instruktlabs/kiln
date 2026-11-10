import { expect, test } from 'bun:test';
await import('three');
const { BoxGeometry, DataTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } = await import('three/webgpu');
const { createStainedSurfaceProbe } = await import('../src/stained-light');
function fixture() {
  const root = new Group();
  const floor = new Mesh(new PlaneGeometry(8, 8), new MeshBasicMaterial());
  floor.name = 'Mesh_Paving'; floor.rotation.x = -Math.PI / 2; floor.position.y = .06; root.add(floor);
  const window = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ map: new DataTexture(new Uint8Array([255, 20, 10, 255]), 1, 1) }));
  window.material.name = 'StainedGlass'; window.position.set(0, 3, -2); root.add(window);
  const column = new Mesh(new BoxGeometry(1, 3, 1), new MeshBasicMaterial());
  column.name = 'Mesh_Column_Stone'; column.position.set(0, 1.5, 0); root.add(column);
  return root;
}
test('the first opaque column receives red window light and stops it before the floor behind', () => {
  const probe = createStainedSurfaceProbe(fixture(), undefined, new Vector3(0, 1, -1).normalize());
  try {
    const face = probe.sample(new Vector3(0, 1.5, -.5), new Vector3(0, 0, -1));
    expect(face.filtered).toBe(true); expect(face.shadowed).toBe(false); expect(face.color[0]).toBeGreaterThan(.5); expect(face.color[1]).toBeLessThan(.02);
    const behind = probe.sample(new Vector3(0, .06, 2), new Vector3(0, 1, 0));
    expect(behind.shadowed).toBe(true); expect(behind.color).toEqual([0, 0, 0]);
    const clear = probe.sample(new Vector3(1.5, .06, 1), new Vector3(0, 1, 0));
    expect(clear.filtered).toBe(true); expect(clear.shadowed).toBe(false); expect(clear.color[0]).toBeGreaterThan(.5);
  } finally { probe.dispose(); }
});

test('projection keeps depth nearest, smooths only RGB, and binds before shader caching without borrowed disposal', async () => {
  const { DirectionalLight, LinearFilter, NearestFilter } = await import('three/webgpu');
  const { buildStainedLight, createStainedSunBinding } = await import('../src/stained-light');
  const cathedral = fixture(), sunDirection = new Vector3(0, 1, -1).normalize();
  let borrowed = 0;
  cathedral.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.geometry.addEventListener('dispose', () => borrowed++);
    const material = node.material as InstanceType<typeof MeshBasicMaterial>;
    material.map?.addEventListener('dispose', () => borrowed++);
  });
  const light = buildStainedLight(cathedral, undefined, { sun: sunDirection, cellSize: .25 });
  const projection = light.projection!;
  expect(projection).not.toBeNull(); expect(light.root.children).toHaveLength(0);
  expect(projection.color.magFilter).toBe(LinearFilter);
  expect(projection.depth.magFilter).toBe(NearestFilter);
  const windowPoint = new Vector3(0, 3, -2);
  const pu = (windowPoint.dot(projection.u) - projection.rect.x) * projection.rect.z;
  const pv = (windowPoint.dot(projection.v) - projection.rect.y) * projection.rect.w;
  const x = Math.floor(pu * projection.width), y = Math.floor(pv * projection.height);
  const storedDepth = projection.depth.image.data[y * projection.width + x];
  const sampledV = projection.rect.y + (y + .5) / projection.height / projection.rect.w;
  // Known vertical glass plane z=-2, diagonal sun: depth - v = 2*sqrt(2).
  expect(storedDepth - sampledV).toBeCloseTo(2 * Math.sqrt(2), 5);
  expect(windowPoint.clone().addScaledVector(sunDirection, 1).dot(sunDirection)).toBeGreaterThan(storedDepth);
  expect(windowPoint.clone().addScaledVector(sunDirection, -1).dot(sunDirection)).toBeLessThan(storedDepth);
  let colorDisposed = 0, depthDisposed = 0;
  projection.color.addEventListener('dispose', () => colorDisposed++);
  projection.depth.addEventListener('dispose', () => depthDisposed++);
  const sun = new DirectionalLight(0xffffff, 3); sun.castShadow = true;
  const binding = createStainedSunBinding(sun), node = (sun as any).colorNode;
  light.bindSun(sun); expect(binding.active).toBe(true); expect((sun as any).colorNode).toBe(node);
  sun.castShadow = false; light.bindSun(sun); expect(binding.active).toBe(false);
  sun.castShadow = true; light.bindSun(sun); expect(binding.active).toBe(true);
  const replacement = new DirectionalLight(0xffffff, 3); replacement.castShadow = true;
  const replacementBinding = createStainedSunBinding(replacement);
  light.bindSun(replacement); binding.dispose(); expect(replacementBinding.active).toBe(true);
  light.dispose(); light.dispose(); expect(replacementBinding.active).toBe(false);
  replacementBinding.dispose();
  expect([colorDisposed, depthDisposed, borrowed]).toEqual([1, 1, 0]);
});

test('sub-texel pane seams do not become full-bright unfiltered squares', async () => {
  const { buildStainedLight } = await import('../src/stained-light');
  const root = new Group(), material = new MeshBasicMaterial({ map: new DataTexture(new Uint8Array([40, 30, 220, 255]), 1, 1) });
  material.name = 'StainedGlass';
  for (const side of [-1, 1]) {
    const pane = new Mesh(new PlaneGeometry(1.98, 4), material); pane.position.set(side * 1.01, 3, -2); root.add(pane);
  }
  const light = buildStainedLight(root, undefined, { sun: new Vector3(0, 1, -1).normalize(), cellSize: .25 });
  try {
    const p = light.projection!, center = new Vector3(0, 3, -2);
    const x = Math.floor((center.dot(p.u) - p.rect.x) * p.rect.z * p.width);
    const y = Math.floor((center.dot(p.v) - p.rect.y) * p.rect.w * p.height);
    const i = (y * p.width + x) * 4;
    expect(p.color.image.data[i + 3]).toBe(255);
    expect(p.color.image.data[i + 2]).toBeGreaterThan(p.color.image.data[i]);
  } finally { light.dispose(); }
});
