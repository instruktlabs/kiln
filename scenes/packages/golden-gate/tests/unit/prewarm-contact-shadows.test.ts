import { expect, test } from 'bun:test';
import { BackSide, BufferAttribute, DoubleSide, Fog, FrontSide, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, Scene } from 'three/webgpu';
import type { Object3D, WebGPURenderer } from 'three/webgpu';
import { prewarmContactShadows } from '../../src/world/prewarm-contact-shadows';

function fixture() {
  const scene = new Scene(), traffic = new Group(), camera = new PerspectiveCamera();
  scene.fog = new Fog(0, 10, 100); scene.add(traffic); camera.layers.enable(2);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  for (const name of ['sA', 'sB']) geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(8), 4));
  geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.instanceCount = 0;
  const material = new MeshBasicNodeMaterial({ name: 'golden-gate-contact-shadows', side: DoubleSide, transparent: true, depthWrite: false });
  const target = new Mesh(geometry, material); target.name = 'traffic-contact-shadows'; target.visible = false; target.frustumCulled = false; target.layers.set(2); traffic.add(target);
  let geometryDisposed = 0, materialDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++); material.addEventListener('dispose', () => materialDisposed++);
  const renderer = (compile: (object: Object3D, camera: PerspectiveCamera, scene: Scene) => Promise<void>, webgpu = true) => ({ backend: { isWebGPUBackend: webgpu }, compileAsync: compile }) as unknown as WebGPURenderer;
  return { scene, traffic, camera, target, geometry, material, renderer, sharedDisposals: () => [geometryDisposed, materialDisposed], dispose() { geometry.dispose(); material.dispose(); } };
}

test('warms only serialized back/front proxies in the actual scene, retaining their cache owners until disposal', async () => {
  const f = fixture(), abort = new AbortController(), seen: Mesh[] = [], sides: number[] = [], disposed: string[] = [];
  f.material.needsUpdate = true;
  const originalVersion = f.material.version, originalIndex = f.geometry.index, originalArrays = Object.values(f.geometry.attributes).map(attribute => attribute.array), fog = f.scene.fog;
  let finishFirst!: () => void; const first = new Promise<void>(resolve => { finishFirst = resolve; });
  const renderer = f.renderer(async (object, camera, scene) => {
    const proxy = object as Mesh; seen.push(proxy); sides.push(f.material.side);
    expect(proxy).not.toBe(f.target); expect(proxy.parent).toBeNull(); expect(proxy.children).toHaveLength(0);
    expect(proxy.geometry).toBe(f.geometry); expect(proxy.material).toBe(f.material); expect(proxy.visible).toBe(true);
    expect(proxy.frustumCulled).toBe(false); expect(proxy.layers.mask).toBe(f.target.layers.mask);
    expect(camera).toBe(f.camera); expect(scene).toBe(f.scene); expect(scene.fog).toBe(fog);
    expect(f.target.visible).toBe(false); expect(f.target.parent).toBe(f.traffic);
    proxy.addEventListener('dispose', () => disposed.push(proxy.uuid));
    if (seen.length === 1) await first;
  });
  try {
    const pending = prewarmContactShadows(renderer, f.traffic, f.scene, f.camera, abort.signal);
    expect(seen).toHaveLength(1); expect(sides).toEqual([BackSide]); expect(disposed).toEqual([]);
    finishFirst(); const prepared = await pending;
    expect(seen).toHaveLength(2); expect(seen[0]).not.toBe(seen[1]); expect(sides).toEqual([BackSide, FrontSide]);
    expect(f.material.side).toBe(DoubleSide); expect(f.material.version).toBe(originalVersion);
    expect(f.geometry.index).toBe(originalIndex); expect(Object.values(f.geometry.attributes).map(attribute => attribute.array)).toEqual(originalArrays);
    expect(f.traffic.children).toEqual([f.target]); expect(f.geometry.instanceCount).toBe(0); expect(disposed).toEqual([]);
    prepared.dispose(); prepared.dispose(); expect(disposed).toEqual(seen.map(proxy => proxy.uuid)); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { finishFirst(); f.dispose(); }
});

test('leaves value-preserving backend index initialization intact without rewinding the material version', async () => {
  const f = fixture(), index = f.geometry.index!, values = Array.from(index.array), version = f.material.version;
  try {
    const prepared = await prewarmContactShadows(f.renderer(async () => { index.array = new Uint32Array(index.array); }), f.traffic, f.scene, f.camera, new AbortController().signal);
    expect(index.array).toBeInstanceOf(Uint32Array); expect(Array.from(index.array)).toEqual(values); expect(f.geometry.index).toBe(index);
    expect(f.material.side).toBe(DoubleSide); expect(f.material.version).toBe(version); prepared.dispose(); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { f.dispose(); }
});

test('aborting before preparation allocates no proxies and preserves the caller reason', async () => {
  const f = fixture(), abort = new AbortController(), reason = new Error('world abandoned'); abort.abort(reason); let calls = 0;
  try { await expect(prewarmContactShadows(f.renderer(async () => { calls++; }), f.traffic, f.scene, f.camera, abort.signal)).rejects.toBe(reason); expect(calls).toBe(0); expect(f.sharedDisposals()).toEqual([0, 0]); }
  finally { f.dispose(); }
});

test('an abort during compilation awaits that compile, releases its proxy and never starts the other side', async () => {
  const f = fixture(), abort = new AbortController(), reason = new Error('world replaced'), seen: Object3D[] = [], disposed: Object3D[] = [];
  let settle!: () => void; const blocked = new Promise<void>(resolve => { settle = resolve; });
  try {
    const pending = prewarmContactShadows(f.renderer(async object => { seen.push(object); object.addEventListener('dispose', () => disposed.push(object)); await blocked; }), f.traffic, f.scene, f.camera, abort.signal);
    expect(seen).toHaveLength(1); abort.abort(reason); expect(disposed).toEqual([]); settle();
    await expect(pending).rejects.toBe(reason); expect(seen).toHaveLength(1); expect(disposed).toEqual(seen);
    expect(f.material.side).toBe(DoubleSide); expect(f.material.version).toBe(0); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { settle(); f.dispose(); }
});

test('an abort completing the second side also releases both retained proxies', async () => {
  const f = fixture(), abort = new AbortController(), reason = new Error('world abandoned during front compile'), seen: Object3D[] = [], disposed: Object3D[] = [];
  try {
    await expect(prewarmContactShadows(f.renderer(async object => {
      seen.push(object); object.addEventListener('dispose', () => disposed.push(object));
      if (f.material.side === FrontSide) abort.abort(reason);
    }), f.traffic, f.scene, f.camera, abort.signal)).rejects.toBe(reason);
    expect(seen).toHaveLength(2); expect(disposed).toEqual(seen); expect(f.material.side).toBe(DoubleSide); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { f.dispose(); }
});

for (const failedSide of [BackSide, FrontSide]) test(`compile failure on side ${failedSide} is contextual and releases only preparation proxies`, async () => {
  const f = fixture(), failure = new Error('driver rejected shader'), seen: Object3D[] = [], disposed: Object3D[] = [];
  try {
    let caught: unknown;
    try { await prewarmContactShadows(f.renderer(async object => { seen.push(object); object.addEventListener('dispose', () => disposed.push(object)); if (f.material.side === failedSide) throw failure; }), f.traffic, f.scene, f.camera, new AbortController().signal); }
    catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toContain('Golden Gate contact-shadow'); expect((caught as Error).cause).toBe(failure);
    expect(disposed).toEqual(seen); expect(seen).toHaveLength(failedSide === BackSide ? 1 : 2);
    expect(f.material.side).toBe(DoubleSide); expect(f.material.version).toBe(0); expect(f.target.parent).toBe(f.traffic); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { f.dispose(); }
});

test('tiers without contact shadows and the WebGL fallback do not compile unrelated world objects', async () => {
  const f = fixture(); let calls = 0;
  try {
    (await prewarmContactShadows(f.renderer(async () => { calls++; }, false), f.traffic, f.scene, f.camera, new AbortController().signal)).dispose();
    f.target.removeFromParent(); f.traffic.add(new Group());
    (await prewarmContactShadows(f.renderer(async () => { calls++; }), f.traffic, f.scene, f.camera, new AbortController().signal)).dispose();
    expect(calls).toBe(0); expect(f.sharedDisposals()).toEqual([0, 0]);
  } finally { f.dispose(); }
});
