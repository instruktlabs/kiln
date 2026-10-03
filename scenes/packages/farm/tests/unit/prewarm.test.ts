import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, type Object3D } from 'three/webgpu';
import { startWarmPass, registerWarmPoseVariant, WARM_CONCURRENCY, warmChainKey, warmRenderables, type WarmPassRenderer } from '../../src/world/prewarm';

// SPEC 6.4 warm pass (owner decision 2026-09-29 22:05; M4 item 1). No GPU: a recording renderer stands in for three's compileAsync.
function fixture() {
  const scene = new Scene(), root = new Group(), geometry = new BoxGeometry(), wood = new MeshStandardMaterial(), leaf = new MeshStandardMaterial();
  const named = <T extends Object3D>(object: T, name: string) => { object.name = name; return object; };
  const a = named(new Mesh(geometry, wood), 'a'), b = named(new Mesh(geometry, wood), 'b'), child = named(new Mesh(geometry, leaf), 'child');
  a.add(child);
  const batch1 = named(new InstancedMesh(geometry, leaf, 3), 'batch1'), batch2 = named(new InstancedMesh(geometry, leaf, 3), 'batch2');
  const owner = named(new Group(), 'owner'), hiddenSource = named(new Mesh(geometry, wood), 'hidden source');
  owner.visible = false; owner.add(hiddenSource);
  root.add(a, b, batch1, batch2, owner); scene.add(root);
  return { scene, root, camera: new PerspectiveCamera(), a, b, child, batch1, batch2, hiddenSource };
}
function recorder(root: Object3D) {
  const calls: { name: string; culled: boolean; childrenVisible: boolean[]; rootVisible: boolean }[] = [], pending: { name: string; settle: (fail?: boolean) => void }[] = [];
  const renderer: WarmPassRenderer = {
    compileAsync(object) {
      calls.push({ name: object.name, culled: object.frustumCulled, childrenVisible: object.children.map(c => c.visible), rootVisible: root.visible });
      return new Promise((resolve, reject) => pending.push({ name: object.name, settle: fail => fail ? reject(new Error('compile failed')) : resolve(undefined) }));
    },
  };
  return { renderer, calls, pending };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('SPEC 6.4 warm pass', () => {
  test('renderables are the visible drawables below the root; instanced meshes are their own chains, shared material and layout chain together', () => {
    const f = fixture();
    expect(warmRenderables(f.root).map(o => o.name)).toEqual(['a', 'child', 'b', 'batch1', 'batch2']);
    expect(warmChainKey(f.a)).toBe(warmChainKey(f.b));
    expect(warmChainKey(f.child)).not.toBe(warmChainKey(f.a));
    expect(warmChainKey(f.batch1)).not.toBe(warmChainKey(f.batch2));
  });

  test('reveal: the world is hidden while compiling, chains run concurrently up to the limit, each call sees only its own drawable with culling off', async () => {
    const f = fixture(), r = recorder(f.root);
    const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true, concurrency: 8 });
    expect(pass.stats).toMatchObject({ renderables: 5, chains: 4, concurrency: 4, failed: 0, revealed: true });
    // a and b share a chain, so b waits for a; child, batch1 and batch2 start at once.
    expect(r.calls.map(c => c.name).sort()).toEqual(['a', 'batch1', 'batch2', 'child']);
    for (const call of r.calls) { expect(call.culled).toBe(false); expect(call.rootVisible).toBe(false); expect(call.childrenVisible.every(v => !v)).toBe(true); }
    expect(f.a.frustumCulled && f.child.visible && f.batch1.frustumCulled).toBe(true);
    expect(f.root.visible).toBe(false);
    expect(pass.step()).toBe(false); expect(pass.phase).toBe('compiling');
    r.pending.find(p => p.name === 'a')!.settle(); await flush();
    expect(r.calls.map(c => c.name)).toContain('b');
    for (const p of r.pending) if (p.name !== 'a') p.settle(p.name === 'batch2'); await flush();
    expect(pass.stats.failed).toBe(1);
    // drawing: shown, culling off everywhere for one frame; then restored and complete.
    expect(pass.step()).toBe(false); expect(pass.phase).toBe('drawing');
    expect(f.root.visible).toBe(true);
    expect([f.a, f.b, f.child, f.batch1, f.batch2].every(o => !o.frustumCulled)).toBe(true);
    expect(f.hiddenSource.frustumCulled).toBe(true);
    expect(pass.step()).toBe(true); expect(pass.phase).toBe('done');
    expect([f.a, f.b, f.child, f.batch1, f.batch2].every(o => o.frustumCulled)).toBe(true);
    expect(pass.stats.compileFrames).toBe(1);
    expect(pass.step()).toBe(true);
  });

  test('at most `concurrency` chains compile at once (three builds node materials in slices across tasks; many concurrent builds keep their temporaries alive into the old generation); a finished chain frees its slot for the next', async () => {
    const f = fixture(), r = recorder(f.root);
    const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true, concurrency: 2 });
    expect(pass.stats.concurrency).toBe(2);
    // Chains in first-seen order: [a, b], [child], [batch1], [batch2].
    expect(r.calls.map(c => c.name)).toEqual(['a', 'child']);
    r.pending.find(p => p.name === 'child')!.settle(); await flush();
    expect(r.calls.map(c => c.name)).toEqual(['a', 'child', 'batch1']);
    r.pending.find(p => p.name === 'a')!.settle(); await flush();
    // a's chain continues with b in the same slot; batch2 waits for a free slot.
    expect(r.calls.map(c => c.name)).toEqual(['a', 'child', 'batch1', 'b']);
    r.pending.find(p => p.name === 'batch1')!.settle(); await flush();
    expect(r.calls.map(c => c.name)).toEqual(['a', 'child', 'batch1', 'b', 'batch2']);
    for (const p of r.pending) if (p.name === 'b' || p.name === 'batch2') p.settle(); await flush();
    expect(pass.step()).toBe(false); expect(pass.phase).toBe('drawing');
    expect(pass.step()).toBe(true);
    // The default is bounded too: 20 instanced meshes are 20 chains, of which WARM_CONCURRENCY start.
    const g = fixture(), s = recorder(g.root);
    for (let i = 0; i < 16; i++) g.root.add(new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 2));
    const bounded = startWarmPass(s.renderer, g.scene, g.camera, g.root, { reveal: false });
    expect(bounded.stats.chains).toBe(20);
    expect(WARM_CONCURRENCY).toBeGreaterThanOrEqual(1); expect(WARM_CONCURRENCY).toBeLessThan(20);
    expect(bounded.stats.concurrency).toBe(WARM_CONCURRENCY); expect(s.calls.length).toBe(WARM_CONCURRENCY);
    bounded.dispose();
  });

  test('a rebuilt world (no reveal) stays visible; disposing mid-pass shows a hidden world and stops the chains', async () => {
    const shown = fixture(), r1 = recorder(shown.root);
    const rebuilt = startWarmPass(r1.renderer, shown.scene, shown.camera, shown.root, { reveal: false });
    expect(r1.calls.every(call => call.rootVisible)).toBe(true); expect(shown.root.visible).toBe(true);
    rebuilt.dispose();
    const hidden = fixture(), r2 = recorder(hidden.root);
    const pass = startWarmPass(r2.renderer, hidden.scene, hidden.camera, hidden.root, { reveal: true });
    expect(hidden.root.visible).toBe(false);
    pass.dispose();
    expect(hidden.root.visible).toBe(true);
    r2.pending.find(p => p.name === 'a')!.settle(); await flush();
    expect(r2.calls.map(c => c.name)).not.toContain('b');
    expect(pass.step()).toBe(false);
  });

  test('S5: onDraw runs once as drawing starts (after the reveal, culling off); drawables the camera layers miss are not compiled but draw unculled', async () => {
    const f = fixture(), r = recorder(f.root), proxy = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), seen: string[] = [];
    proxy.name = 'stand-in'; proxy.layers.set(1); f.b.add(proxy);
    expect(warmRenderables(f.root, f.camera.layers).map(o => o.name)).toEqual(['a', 'child', 'b', 'batch1', 'batch2']);
    expect(warmRenderables(f.root).map(o => o.name)).toEqual(['a', 'child', 'b', 'stand-in', 'batch1', 'batch2']);
    const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true, onDraw: () => seen.push(`${pass.phase} ${f.root.visible} ${f.a.frustumCulled} ${proxy.frustumCulled}`) });
    expect(pass.stats.renderables).toBe(5);
    for (let i = 0; i < 3; i++) { for (const p of r.pending.splice(0)) p.settle(); await flush(); }
    expect(r.calls.map(c => c.name)).not.toContain('stand-in');
    expect(pass.step()).toBe(false); expect(seen).toEqual(['drawing true false false']);
    expect(pass.step()).toBe(true); expect(proxy.frustumCulled && f.a.frustumCulled).toBe(true); expect(pass.step()).toBe(true);
    expect(seen.length).toBe(1);
  });
});


function poseFixture() {
  const f = fixture(), variant = f.a.clone(false), proxy = new Mesh(f.a.geometry, f.a.material), hiddenChild = f.a.clone(false);
  variant.name = 'relaxed pose'; variant.visible = false; variant.scale.z = -1;
  proxy.name = 'pose shadow'; proxy.layers.set(1); proxy.frustumCulled = false;
  hiddenChild.name = 'ordinary hidden child'; hiddenChild.visible = false;
  variant.add(proxy, hiddenChild); f.root.add(variant);
  const unregister = registerWarmPoseVariant(variant);
  return { ...f, variant, proxy, hiddenChild, unregister };
}
async function settleAll(r: ReturnType<typeof recorder>, fail?: string) {
  for (let i = 0; i < 5; i++) { for (const p of r.pending.splice(0)) p.settle(p.name === fail); await flush(); }
}

test('registered hidden pose and its shadow branch warm before ready, with exact visibility/culling restoration', async () => {
  const f = poseFixture(), r = recorder(f.root), seen: boolean[][] = [];
  // Registration cannot punch through an unrelated hidden ancestor.
  const unregisterHidden = registerWarmPoseVariant(f.hiddenSource);
  try {
    expect(warmRenderables(f.root).map(o => o.name)).toContain('relaxed pose');
    expect(warmRenderables(f.root).map(o => o.name)).toContain('pose shadow');
    expect(warmRenderables(f.root).map(o => o.name)).not.toContain('ordinary hidden child');
    expect(warmRenderables(f.root).map(o => o.name)).not.toContain('hidden source');
    const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true,
      onDraw: () => seen.push([f.variant.visible, f.proxy.frustumCulled, f.variant.frustumCulled, f.hiddenChild.visible]) });
    await settleAll(r);
    expect(r.calls.map(call => call.name)).toContain('relaxed pose');
    expect(r.calls.map(call => call.name)).not.toContain('pose shadow');
    expect(f.variant.visible).toBe(false); expect(f.variant.frustumCulled).toBe(true);
    expect(pass.step()).toBe(false); expect(pass.phase).toBe('drawing');
    expect(seen).toEqual([[true, false, false, false]]);
    expect(pass.step()).toBe(true); expect(pass.phase).toBe('done');
    expect(f.variant.visible).toBe(false); expect(f.a.visible).toBe(true);
    expect(f.variant.frustumCulled).toBe(true); expect(f.proxy.frustumCulled).toBe(false);
    expect(f.hiddenChild.visible).toBe(false); pass.dispose();
  } finally { f.unregister(); unregisterHidden(); }
});

test('registered variants are visible only during each synchronous compile collection, including thrown/rejected compiles', async () => {
  for (const mode of ['throw', 'reject'] as const) {
    const f = poseFixture(), calls: string[] = [];
    const renderer: WarmPassRenderer = { compileAsync(object) {
      calls.push(object.name);
      if (object === f.variant) {
        expect(object.visible).toBe(true); expect(object.frustumCulled).toBe(false);
        expect(object.children.every(child => !child.visible)).toBe(true);
        if (mode === 'throw') throw new Error('compile fixture');
        return Promise.reject(new Error('compile fixture'));
      }
      return Promise.resolve();
    } };
    try {
      const pass = startWarmPass(renderer, f.scene, f.camera, f.root, { reveal: true }); await flush();
      expect(calls).toContain('relaxed pose'); expect(pass.stats.failed).toBe(1);
      expect(f.variant.visible).toBe(false); expect(f.proxy.visible).toBe(true); expect(f.hiddenChild.visible).toBe(false);
      expect(pass.step()).toBe(false); expect(f.variant.visible).toBe(true);
      expect(pass.step()).toBe(true); expect(f.variant.visible).toBe(false);
      pass.dispose();
    } finally { f.unregister(); }
  }
});

test('disposing during compile or drawing restores only registered variant overrides; late compiles cannot reveal it', async () => {
  for (const drawing of [false, true]) {
    const f = poseFixture(), r = recorder(f.root);
    try {
      const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true });
      if (drawing) { await settleAll(r); pass.step(); expect(f.variant.visible).toBe(true); }
      pass.dispose(); pass.dispose(); await settleAll(r);
      expect(pass.step()).toBe(false); expect(f.variant.visible).toBe(false);
      expect(f.variant.frustumCulled).toBe(true); expect(f.proxy.frustumCulled).toBe(false);
      expect(f.hiddenChild.visible).toBe(false); expect(f.root.visible).toBe(true);
    } finally { f.unregister(); }
  }
});

test('onDraw failure restores registered visibility and culling before propagating the error', async () => {
  const f = poseFixture(), r = recorder(f.root);
  try {
    const pass = startWarmPass(r.renderer, f.scene, f.camera, f.root, { reveal: true, onDraw: () => { throw new Error('prime fixture'); } });
    await settleAll(r);
    expect(() => pass.step()).toThrow('prime fixture');
    expect(f.variant.visible).toBe(false); expect(f.a.frustumCulled).toBe(true);
    expect(f.proxy.frustumCulled).toBe(false); expect(pass.step()).toBe(false); pass.dispose();
  } finally { f.unregister(); }
});

test('unregistered pose branches return to ordinary hidden behavior', () => {
  const f = poseFixture(); f.unregister(); f.unregister();
  expect(warmRenderables(f.root).map(object => object.name)).not.toContain('relaxed pose');
  expect(warmRenderables(f.root).map(object => object.name)).not.toContain('pose shadow');
});
